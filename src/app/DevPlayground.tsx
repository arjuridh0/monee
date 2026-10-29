import { AppLayout } from '@/components/layout/AppLayout'
import { UIAnalytics, UIPlayground } from './UIPlayground'

export default function DevPlayground() {
  return <AppLayout analytics={<UIAnalytics />}><UIPlayground /></AppLayout>
}
