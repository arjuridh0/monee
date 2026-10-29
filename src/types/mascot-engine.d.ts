declare module '@mascots/core/mascot_canvas.js' {
  import type { MascotId } from '@/core/finance/types'

  export type MascotState = 'idle' | 'gabut' | 'greeting' | 'tap' | 'pet' | 'happy'
    | 'angry' | 'sad' | 'surprised' | 'listening' | 'thinking' | 'annoyed'
    | 'celebrate' | 'sleepy'

  export const STATES: readonly MascotState[]

  export class MascotCanvas {
    constructor(options: {
      canvas: HTMLCanvasElement
      mascot?: MascotId
      width?: number
      state?: MascotState
      interactive?: boolean
      autoGabut?: boolean
    })
    reduced: boolean
    setMascot(id: MascotId): void
    setState(state: MascotState): void
    resize(width: number): void
    destroy(): void
  }
}
