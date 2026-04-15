import logoIcon from '@/assets/images/logo-icon.png'
import { type DemoState, useLoginDemo } from '../hooks/useLoginDemo'

// ── AI 头像 ───────────────────────────────────────────────────────────────────
function AiAvatar() {
  return (
    <div className="login-demo-chat__avatar login-demo-chat__avatar--ai">
      <img src={logoIcon} alt="AI" style={{ width: 14, height: 14, objectFit: 'contain' }} />
    </div>
  )
}

// ── 打字指示器气泡 ─────────────────────────────────────────────────────────────
function TypingBubble() {
  return (
    <div className="login-demo-chat__msg login-demo-chat__msg--ai login-demo-chat__msg--enter">
      <AiAvatar />
      <div className="login-demo-chat__bubble login-demo-chat__bubble--typing">
        <span className="login-demo-typing"><i /><i /><i /></span>
      </div>
    </div>
  )
}

// ── 迷你柱状图（接收 props 而不是自调 hook）────────────────────────────────────
function DemoChart({ barData, barKey, xLabels }: Pick<DemoState, 'barData' | 'barKey' | 'xLabels'>) {
  const max = Math.max(...barData.bars, 1)

  return (
    <div className="login-demo-chart">
      <div className="login-demo-chart__title">{barData.barLabel}</div>
      <div className="login-demo-chart__bars">
        {barData.bars.map((val, i) => (
          <div key={i} className="login-demo-chart__col">
            <div
              key={`${barKey}-${i}`}
              className="login-demo-chart__bar"
              style={{
                height: `${(val / max) * 100}%`,
                background: barData.barColors[i],
                minHeight: val > 0 ? 4 : 0,
              }}
            />
            <div className="login-demo-chart__x">{xLabels[i]}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── 主展示组件 ────────────────────────────────────────────────────────────────
export default function LoginShowcase() {
  const state = useLoginDemo()
  const { messages, isThinking, typingText } = state

  return (
    <div className="login-showcase">
      {/* 顶部品牌 */}
      <div className="login-showcase__header">
        <img
          src={logoIcon}
          alt="茶掌柜"
          className="login-showcase__logo"
          style={{ width: 40, height: 40, objectFit: 'contain' }}
        />
        <div>
          <div className="login-showcase__brand">茶掌柜</div>
          <div className="login-showcase__tagline">AI 驱动的茶叶经营管理系统</div>
        </div>
      </div>

      {/* 演示卡片 */}
      <div className="login-demo-card">
        {/* macOS 风格标题栏 */}
        <div className="login-demo-card__titlebar">
          <span className="login-demo-card__dot" style={{ background: '#ff5f57' }} />
          <span className="login-demo-card__dot" style={{ background: '#febc2e' }} />
          <span className="login-demo-card__dot" style={{ background: '#28c840' }} />
          <span className="login-demo-card__label">AI 助手 · 实时问答</span>
        </div>

        {/* 对话区 */}
        <div className="login-demo-chat">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`login-demo-chat__msg login-demo-chat__msg--${msg.role} login-demo-chat__msg--enter`}
            >
              {msg.role === 'ai' && <AiAvatar />}
              <div className="login-demo-chat__bubble">
                {msg.text.split('\n').map((line, j, arr) => (
                  <span key={j}>{line}{j < arr.length - 1 && <br />}</span>
                ))}
              </div>
            </div>
          ))}

          {isThinking && <TypingBubble />}

          {typingText && (
            <div className="login-demo-chat__msg login-demo-chat__msg--ai login-demo-chat__msg--enter">
              <AiAvatar />
              <div className="login-demo-chat__bubble">
                {typingText.split('\n').map((line, j, arr) => (
                  <span key={j}>{line}{j < arr.length - 1 && <br />}</span>
                ))}
                <span className="login-demo-cursor" />
              </div>
            </div>
          )}
        </div>

        {/* 图表 */}
        <DemoChart barData={state.barData} barKey={state.barKey} xLabels={state.xLabels} />
      </div>

      {/* 特性标签 */}
      <div className="login-showcase__tags">
        {['自然语言查询', 'SQL 自动生成', '智能图表', '拍照录单', '多端适配'].map((tag, i) => (
          <span key={tag} className="login-showcase__tag" style={{ animationDelay: `${i * 0.1}s` }}>
            {tag}
          </span>
        ))}
      </div>
    </div>
  )
}
