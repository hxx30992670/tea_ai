import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import type { UserInfo } from '@/types'

const ROLE_MAP: Record<string, { label: string; variant: 'default' | 'success' | 'warning' }> = {
  admin: { label: '老板', variant: 'default' },
  manager: { label: '店长/主管', variant: 'success' },
  staff: { label: '店员/销售', variant: 'warning' },
}

interface UserCardProps {
  user: UserInfo
}

export function UserCard({ user }: UserCardProps) {
  const role = {
    variant: ROLE_MAP[user.role]?.variant ?? ('default' as const),
    label: user.roleProfile?.name ?? ROLE_MAP[user.role]?.label ?? user.role,
  }

  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#1a2744] to-[#0F1B2D] border border-border p-5">
      <div className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-primary/10 blur-2xl" />

      <div className="flex items-center gap-4">
        <Avatar className="h-14 w-14 ring-2 ring-primary/30">
          <AvatarFallback className="bg-primary/20 text-primary text-lg font-bold">
            {(user.realName || user.username)[0].toUpperCase()}
          </AvatarFallback>
        </Avatar>

        <div>
          <h2 className="text-lg font-bold text-foreground">{user.realName || user.username}</h2>
          <p className="text-sm text-muted-foreground mt-0.5">@{user.username}</p>
          <div className="mt-2">
            <Badge variant={role.variant}>{role.label}</Badge>
          </div>
        </div>
      </div>
    </div>
  )
}
