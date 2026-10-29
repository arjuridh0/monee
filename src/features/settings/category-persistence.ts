import type { MoneeDB } from '@/core/db/migrations'
import { STORES } from '@/core/db/schema'
import { CATEGORY_ICONS, type CategoryIconName } from '@/core/finance/category-options'
import type { Category } from '@/core/finance/types'

export type CategoryErrorCode =
  | 'ERR_CATEGORY_INVALID'
  | 'ERR_CATEGORY_STALE'
  | 'ERR_CATEGORY_PROTECTED'
  | 'ERR_CATEGORY_IN_USE'
  | 'ERR_CATEGORY_DUPLICATE'

export class CategoryError extends Error {
  readonly code: CategoryErrorCode

  constructor(code: CategoryErrorCode, message: string) {
    super(message)
    this.name = 'CategoryError'
    this.code = code
  }
}

function fail(code: CategoryErrorCode, message: string): CategoryError {
  return new CategoryError(code, message)
}

function assertValid(category: Category): void {
  if (!category || typeof category.id !== 'string' || !category.id.trim()
    || typeof category.name !== 'string' || !category.name.trim() || category.name.trim().length > 32
    || !CATEGORY_ICONS.includes(category.icon as CategoryIconName)
    || !/^#[\da-f]{6}$/i.test(category.color)
    || (category.type !== 'expense' && category.type !== 'income')
    || typeof category.isDefault !== 'boolean') {
    throw fail('ERR_CATEGORY_INVALID', 'Periksa nama, ikon, dan warna kategori.')
  }
}

function sameCategory(left: Category, right: Category): boolean {
  return left.id === right.id && left.name === right.name && left.type === right.type
    && left.icon === right.icon && left.color === right.color && left.isDefault === right.isDefault
}

export async function saveCategory(db: MoneeDB, category: Category, expected?: Category): Promise<Category> {
  const tx = db.transaction(STORES.categories, 'readwrite')
  try {
    const currentCategories = await tx.store.getAll()
    const current = currentCategories.find(item => item.id === category.id)
    assertValid(category)

    if (expected ? !current || !sameCategory(current, expected) : Boolean(current)) {
      throw fail('ERR_CATEGORY_STALE', 'Kategori berubah di tab lain. Muat ulang Monee.')
    }

    if (expected && current) {
      if (category.type !== current.type || category.isDefault !== current.isDefault) {
        throw fail('ERR_CATEGORY_PROTECTED', 'Jenis kategori tidak dapat diubah.')
      }
      if (category.id === 'cat-tabungan' && category.name !== 'Tabungan') {
        throw fail('ERR_CATEGORY_PROTECTED', 'Nama kategori Tabungan diperlukan untuk pencatatan setoran.')
      }
    } else if (category.isDefault) {
      throw fail('ERR_CATEGORY_PROTECTED', 'Kategori baru harus menjadi kategori khusus.')
    }

    const normalizedName = category.name.trim().toLocaleLowerCase('id-ID')
    if (currentCategories.some(item => item.id !== category.id && item.type === category.type
      && item.name.trim().toLocaleLowerCase('id-ID') === normalizedName)) {
      throw fail('ERR_CATEGORY_DUPLICATE', 'Nama kategori ini sudah dipakai untuk transaksi sejenis.')
    }

    const saved = { ...category, name: category.name.trim(), icon: category.icon as CategoryIconName }
    await tx.store.put(saved)
    await tx.done
    return saved
  } catch (error) {
    try { tx.abort() } catch { /* The transaction has already completed or aborted. */ }
    await tx.done.catch(() => undefined)
    throw error
  }
}

export async function deleteCategory(db: MoneeDB, id: string): Promise<void> {
  const tx = db.transaction([STORES.categories, STORES.transactions, STORES.recurringIncomes], 'readwrite')
  try {
    const category = await tx.objectStore(STORES.categories).get(id)
    if (!category) throw fail('ERR_CATEGORY_STALE', 'Kategori sudah berubah. Muat ulang Monee.')
    if (category.isDefault) throw fail('ERR_CATEGORY_PROTECTED', 'Kategori bawaan tidak dapat dihapus.')

    const usage = await tx.objectStore(STORES.transactions).index('by-category').getKey(id)
    const recurringIncomes = await tx.objectStore(STORES.recurringIncomes).getAll()
    if (usage !== undefined || recurringIncomes.some(income => income.categoryId === id)) {
      throw fail('ERR_CATEGORY_IN_USE', 'Kategori sudah dipakai transaksi atau pemasukan rutin dan tidak dapat dihapus.')
    }

    await tx.objectStore(STORES.categories).delete(id)
    await tx.done
  } catch (error) {
    try { tx.abort() } catch { /* The transaction has already completed or aborted. */ }
    await tx.done.catch(() => undefined)
    throw error
  }
}
