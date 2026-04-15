import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { LogOut, Smartphone, Info, Shield, Phone } from 'lucide-react'
import { authApi } from '@/api/auth'
import { useAuthStore } from '@/store/auth'
import { usePwaInstall } from '@/hooks/usePwaInstall'
import { PageHeader } from '@/components/layout/PageHeader'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { UserCard } from './components/UserCard'
import { MenuList } from './components/MenuList'

export default function ProfilePage() {
  const navigate = useNavigate()
  const { user, logout, updateUser } = useAuthStore()
  const userId = user?.id
  const { canInstall, isInstalled, platform, triggerInstall } = usePwaInstall()
  const [confirmLogout, setConfirmLogout] = useState(false)
  const [showIosGuide, setShowIosGuide] = useState(false)

  useEffect(() => {
    if (!userId) return

    let cancelled = false

    const loadProfile = async () => {
      try {
        const res = await authApi.profile()
        if (!cancelled) {
          updateUser(res.data)
        }
      } catch {
        // 资料接口失败时保留本地登录态，避免影响“我的”页展示
      }
    }

    void loadProfile()

    return () => {
      cancelled = true
    }
  }, [userId, updateUser])

  const handleLogout = () => {
    logout()
    navigate('/login', { replace: true })
  }

  const handleInstall = () => {
    if (platform === 'ios') setShowIosGuide(true)
    else triggerInstall()
  }

  if (!user) return null

  const menuGroups = [
    ...((!isInstalled && (canInstall || platform === 'ios'))
      ? [{
          title: '应用',
          items: [{
            icon: <Smartphone size={18} />,
            label: '添加到主屏幕',
            onClick: handleInstall,
          }],
        }]
      : []),
    {
      title: '账号',
      items: [
        {
          icon: <Phone size={18} />,
          label: '手机号',
          value: user.phone || '未设置',
        },
        {
          icon: <Shield size={18} />,
          label: '账号角色',
          value: user.roleProfile?.name ?? { admin: '老板', manager: '店长/主管', staff: '店员/销售' }[user.role] ?? user.role,
        },
      ],
    },
    {
      title: '关于',
      items: [
        {
          icon: <Info size={18} />,
          label: '版本',
          value: 'v1.0.0',
        },
      ],
    },
    {
      items: [
        {
          icon: <LogOut size={18} />,
          label: '退出登录',
          onClick: () => setConfirmLogout(true),
          danger: true,
        },
      ],
    },
  ]

  return (
    <div className="flex min-h-full flex-col bg-background">
      <PageHeader title="我的" />

      <div className="flex-1 space-y-4 p-4">
        <UserCard user={user} />
        <MenuList groups={menuGroups} />
      </div>

      {/* 退出确认弹窗 */}
      <Dialog open={confirmLogout} onOpenChange={setConfirmLogout}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>退出登录</DialogTitle>
            <DialogDescription>确认退出当前账号？</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmLogout(false)}>
              取消
            </Button>
            <Button variant="destructive" onClick={handleLogout}>
              退出
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* iOS 安装引导 */}
      <Dialog open={showIosGuide} onOpenChange={setShowIosGuide}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>添加到主屏幕</DialogTitle>
            <DialogDescription>
              点击 Safari 底部分享按钮 → 「添加到主屏幕」→ 「添加」
            </DialogDescription>
          </DialogHeader>
          <Button variant="gold" className="mt-2" onClick={() => setShowIosGuide(false)}>
            我知道了
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  )
}
