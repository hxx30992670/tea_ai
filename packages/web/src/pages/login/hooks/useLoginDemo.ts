import { useEffect, useRef, useState } from 'react'

export interface DemoMessage {
  id: number
  role: 'user' | 'ai'
  text: string
}

interface Conv {
  user: string
  ai: string
  bars: number[]
  barColors: string[]
  barLabel: string
}

const CONVS: Conv[] = [
  {
    user: '今天赚了多少？',
    ai: '今日销售额 ¥12,480，较昨日 ↑18%\n本月累计 ¥238,600，已完成月目标 79%',
    bars: [42, 35, 68, 55, 80, 72, 90, 85],
    barColors: ['#2d6a4f', '#2d6a4f', '#2d6a4f', '#2d6a4f', '#52b788', '#52b788', '#52b788', '#52b788'],
    barLabel: '近 8 日销售额（万元）',
  },
  {
    user: '谁欠我钱还没还？',
    ai: '共 3 位客户待收款 ¥26,480\n· 清远茶行  ¥12,400（超期 18 天）\n· 德兴茶庄  ¥8,760\n· 汇丰茶业  ¥5,320',
    bars: [124, 88, 53, 0, 0, 0, 0, 0],
    barColors: ['#e07b54', '#d4a853', '#52b788', '#2d6a4f', '#2d6a4f', '#2d6a4f', '#2d6a4f', '#2d6a4f'],
    barLabel: '客户欠款（百元）',
  },
  {
    user: '哪些商品库存告急？',
    ai: '⚠️ 3 款商品库存告急\n· 明前龙井 · 剩余 8 盒\n· 铁观音特级 · 剩余 12 盒\n· 白毫银针 · 剩余 6 盒',
    bars: [8, 12, 6, 25, 18, 30, 15, 22],
    barColors: ['#e07b54', '#d4a853', '#e07b54', '#2d6a4f', '#52b788', '#2d6a4f', '#52b788', '#2d6a4f'],
    barLabel: '商品库存量（盒）',
  },
  {
    user: '本月最畅销商品？',
    ai: '🏆 本月冠军：明前龙井\n销售额 ¥34,200，较上月 ↑24%\n建议关注库存，及时补货',
    bars: [342, 186, 124, 98, 76, 65, 54, 43],
    barColors: ['#d4a853', '#52b788', '#2d6a4f', '#2d6a4f', '#2d6a4f', '#2d6a4f', '#2d6a4f', '#2d6a4f'],
    barLabel: '商品销售排名（百元）',
  },
]

const X_LABELS = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月']

const TYPING_SPEED = 26   // ms/char
const PRE_USER     = 600  // 显示用户消息前停顿
const THINK_TIME   = 1500 // AI 思考时间
const DONE_PAUSE   = 3000 // AI 回复完后等待
const RESET_PAUSE  = 700  // 清空后等待

export interface DemoState {
  messages: DemoMessage[]
  isThinking: boolean
  typingText: string
  barData: Conv
  barKey: number
  xLabels: string[]
}

export function useLoginDemo(): DemoState {
  const [messages,    setMessages]    = useState<DemoMessage[]>([])
  const [isThinking,  setIsThinking]  = useState(false)
  const [typingText,  setTypingText]  = useState('')
  const [barData,     setBarData]     = useState<Conv>(CONVS[0])
  const [barKey,      setBarKey]      = useState(0)

  const idRef      = useRef(0)
  const convIdxRef = useRef(0)

  useEffect(() => {
    let cancelled = false
    let cancelCurrent = () => {}

    const delay = (ms: number) =>
      new Promise<void>((res, rej) => {
        const t = setTimeout(res, ms)
        cancelCurrent = () => { clearTimeout(t); rej(new Error('cancel')) }
      })

    const run = async () => {
      try {
        while (!cancelled) {
          const ci   = convIdxRef.current % CONVS.length
          const conv = CONVS[ci]

          // 切换图表
          setBarData(conv)
          setBarKey(k => k + 1)

          await delay(PRE_USER)

          // 用户消息入场
          const uid = idRef.current++
          setMessages(prev => [...prev.slice(-3), { id: uid, role: 'user', text: conv.user }])

          await delay(THINK_TIME)

          // AI 思考中
          setIsThinking(true)
          await delay(THINK_TIME * 0.8)
          setIsThinking(false)

          // 逐字打出 AI 回复
          const full = conv.ai
          for (let i = 1; i <= full.length; i++) {
            if (cancelled) return
            setTypingText(full.slice(0, i))
            await delay(TYPING_SPEED)
          }

          // 定稿 AI 消息
          const aid = idRef.current++
          setMessages(prev => [...prev.slice(-3), { id: aid, role: 'ai', text: full }])
          setTypingText('')

          await delay(DONE_PAUSE)

          convIdxRef.current++

          // 每轮 4 组对话后清空，重新来过
          if (convIdxRef.current % CONVS.length === 0) {
            setMessages([])
            await delay(RESET_PAUSE)
          }
        }
      } catch { /* 已取消 */ }
    }

    void run()

    return () => {
      cancelled = true
      cancelCurrent()
    }
  }, [])

  return { messages, isThinking, typingText, barData, barKey, xLabels: X_LABELS }
}
