import logoWithText from '@/assets/images/logo-400-light.png'

export default function LoginBrand() {
  return (
    <div className="login-brand">
      <img
        src={logoWithText}
        alt="茶掌柜"
        className="login-brand__logo-img"
        style={{ width: 180, height: 'auto', display: 'block', margin: '0 auto' }}
      />
    </div>
  )
}
