import { useEffect, useRef, useState } from 'react'
import { MoreMenu } from './components/MoreMenu'
import { Hint } from './components/Hint'
import { Tag } from './components/Tag'
import { applyMeta, t, type Key } from './i18n'
import { act, startAnalytics, track } from './analytics'
import { landing, peakEvery, sharePeak, trackLanding } from './share'
import { FABRICS, startGame, type Game, type RunInfo } from './game'
import type { FabricId } from './twirl/gores'

const Q = new URLSearchParams(location.search)
const SHOT = Q.has('shot')

/** a challenge link (same rule as rivalTurns in cards.ts): the sender's turns `k` (5..999) and their skirt `f` */
const RIVAL = (() => {
  const v = landing.recipient ? Number(Q.get('k')) : 0
  return Number.isInteger(v) && v >= 5 && v <= 999 ? v : 0
})()
const START: FabricId = (() => {
  const f = Number(Q.get('f'))
  return landing.recipient && Number.isInteger(f) && f >= 0 && f < FABRICS.length ? FABRICS[f] : 'chiffon'
})()

interface Pill {
  n: number
  r: number
  best: boolean
  done: boolean
}
interface Line {
  id: number
  text: string
}

export default function App() {
  const ref = useRef<HTMLCanvasElement>(null)
  const game = useRef<Game | null>(null)
  const [touched, setTouched] = useState(false)
  const [nogl, setNogl] = useState(false)
  const [label, setLabel] = useState('')
  const [fabric, setFabric] = useState<FabricId>(START)
  const [pill, setPill] = useState<Pill | null>(null)
  const [line, setLine] = useState<Line | null>(null)
  const [mum, setMum] = useState(0)
  useEffect(() => {
    applyMeta('twirl')
    startAnalytics('twirl')
    trackLanding()
    // lines: at most one every 3 s; the rest wait their turn (each fires once per visit, so the queue stays short)
    const queue: Key[] = []
    let lastLine = 0, lineTimer = 0, id = 0
    const next = () => {
      lineTimer = 0
      const k = queue.shift()
      if (!k) return
      lastLine = performance.now()
      setLine({ id: ++id, text: t(k) })
      window.setTimeout(() => setLine((l) => (l && l.id === id ? null : l)), 2800)
      if (queue.length) lineTimer = window.setTimeout(next, 3000)
    }
    const say = (k: string) => {
      const key = k as Key
      if (queue.length >= 3) return
      queue.push(key)
      if (!lineTimer) lineTimer = window.setTimeout(next, Math.max(0, 3000 - (performance.now() - lastLine)))
    }
    // the share slip: the first run of 10 turns, the first dizzy or pockets run; otherwise every so often
    let firstTen = false, dzSeen = false, pkSeen = false, fives = 0
    const runEnd = (r: RunInfo, f: FabricId, snap: HTMLCanvasElement | null) => {
      const data: Record<string, number> = { f: FABRICS.indexOf(f), t: r.turns, p: Math.round(r.peak * 10), b: Math.round(r.bloom * 10), dz: r.dz ? 1 : 0, pk: r.pk ? 1 : 0, wr: r.wr ? 1 : 0 }
      if (RIVAL) data.r = RIVAL
      const big = (r.turns >= 10 && !firstTen) || (r.dz && !dzSeen) || (r.pk && !pkSeen)
      if (r.turns >= 10) firstTen = true
      if (r.dz) dzSeen = true
      if (r.pk) pkSeen = true
      if (big) sharePeak('twirl', { snap, data })
      else if (r.turns >= 5) peakEvery('twirl', ++fives, { snap, data })
    }
    let mumTimer = 0
    game.current = startGame(
      ref.current!,
      {
        onFirstTouch: () => {
          setTouched(true)
          track('play_start')
        },
        onNoGL: () => {
          setNogl(true)
          track('no_webgl')
        },
        label: Q.get('label') === '0' ? undefined : setLabel,
        pill: setPill,
        line: say,
        mum: () => {
          setMum((m) => m + 1)
          clearTimeout(mumTimer)
          mumTimer = window.setTimeout(() => setMum(0), 3400)
        },
        runEnd,
        track,
        act,
        fabric: setFabric,
      },
      START,
    )
    return () => game.current?.dispose()
  }, [])
  // harness: &card=1 draws the share card from this shot and shows it full screen
  const [card, setCard] = useState('')
  useEffect(() => {
    if (!SHOT || !Q.has('card')) return
    const w = window as unknown as { __toy?: { drawn: boolean; ready: boolean } }
    const iv = window.setInterval(() => {
      if (!w.__toy?.drawn) return
      clearInterval(iv)
      const c = ref.current!, snap = document.createElement('canvas')
      snap.width = c.width
      snap.height = c.height
      snap.getContext('2d')!.drawImage(c, 0, 0)
      const f = Math.max(0, FABRICS.indexOf((Q.get('fabric') as FabricId) || fabric))
      const data: Record<string, number> = { f, t: Number(Q.get('t') ?? 37), p: 22, b: 41, dz: Q.get('card') === 'dz' ? 1 : 0, pk: Q.get('card') === 'pk' ? 1 : 0, wr: 0 }
      void import('./card').then(async (m) => {
        const k = await m.makeCard('twirl', { snap, data })
        setCard(k.url)
      })
    }, 100)
    return () => clearInterval(iv)
  }, [fabric])
  const pillText = pill ? t('twirl_pill', { n: pill.n, r: pill.r.toFixed(1) }) + (pill.done && pill.best ? ` · ${t('twirl_best')}` : '') : ''
  return (
    <>
      <canvas ref={ref} />
      {nogl && (
        <div className="fixed inset-0 flex items-center justify-center bg-[#EFE6DA] px-6 text-center text-[15px] text-[#3A2F2A]">
          {t('twirl_nogl')}
        </div>
      )}
      {label && (
        <div className="pointer-events-none fixed inset-x-2 bottom-2 z-30 rounded bg-black/70 px-2 py-1 font-mono text-[11px] leading-tight text-white">
          {label}
        </div>
      )}
      {!SHOT && !nogl && <Rail current={fabric} onPick={(id) => game.current?.swap(id)} />}
      {!SHOT && pill && (
        <div className="pointer-events-none fixed inset-x-0 top-[calc(7vh+5.25rem)] z-10 flex justify-center select-none">
          <span className={`rounded-full bg-[#FFFDF9]/85 px-3.5 py-1 text-[14px] font-semibold tabular-nums text-[#3A2F2A] shadow-[0_3px_12px_rgba(58,47,42,.12)] ${pill.done ? 'ring-1 ring-[#D9728A]/50' : ''}`}>
            {pillText}
          </span>
        </div>
      )}
      {!SHOT && RIVAL > 0 && !pill && <Tag text={t('twirl_tag', { t: RIVAL })} className="top-[calc(7vh+5.25rem)]" paper="bg-[#FFFDF9] text-[#3A2F2A] font-medium" />}
      {!SHOT && mum > 0 && (
        <div key={mum} className="pointer-events-none fixed inset-x-0 top-[calc(7vh+8rem)] z-10 flex justify-center px-4 select-none">
          <div className="max-w-[340px] rounded-2xl rounded-tl-md bg-white/95 px-3.5 py-2 text-[15px] leading-snug text-[#2B2620] shadow-[0_6px_20px_rgba(60,45,30,.18)]">
            <div className="text-[12px] font-semibold text-[#3A8DDE]">{t('twirl_mum')}</div>
            {t('twirl_mum_dizzy')}
          </div>
        </div>
      )}
      {!SHOT && line && (
        <div key={line.id} className="pointer-events-none fixed inset-x-0 bottom-[5.5rem] z-10 flex justify-center px-6 select-none">
          <span className="rounded-full bg-[#FFF9F0]/85 px-3.5 py-1.5 text-center text-[16px] font-medium tracking-wide text-[#4A3A2C]/90 shadow-[0_4px_14px_rgba(74,58,44,.12)]">{line.text}</span>
        </div>
      )}
      {card && (
        <img
          src={card}
          alt=""
          onLoad={() => ((window as unknown as { __toy: { ready: boolean } }).__toy.ready = true)}
          className="fixed inset-0 z-40 m-auto max-h-full max-w-full bg-[#EFE6DA] object-contain"
        />
      )}
      {Q.get('shot') === 'og' && !Q.has('card') && (
        <div className="pointer-events-none fixed left-[6%] top-1/2 z-30 -translate-y-1/2 select-none text-[#3A2F2A]">
          <div className="text-[64px] font-bold leading-none tracking-tight">Give It a Twirl</div>
          <div className="mt-3 text-[40px] font-semibold leading-none text-[#D9728A]">转圈圈</div>
          <div className="mt-4 text-[22px] text-[#3A2F2A]/70">twirl.integ.life</div>
        </div>
      )}
      {!SHOT && <Hint text={t('hint_twirl')} hidden={touched} toy="twirl" />}
      {!SHOT && <MoreMenu current="twirl" />}
    </>
  )
}

const SWATCH: Record<FabricId, { a: string; b: string; trim: string }> = {
  chiffon: { a: '#F4A7B5', b: '#FBD5C0', trim: '#E48A9C' },
  denim: { a: '#3B5B8C', b: '#4C6EA2', trim: '#E08A2E' },
  mamian: { a: '#1E2A4A', b: '#25305A', trim: '#D6B25A' },
  tulle: { a: '#C9B6F2', b: '#E2D6FA', trim: '#FFFFFF' },
}

/** A folded skirt hanging from its hanger's bar (40 by 52), in the skirt's colours. */
function Swatch({ id }: { id: FabricId }) {
  const s = SWATCH[id]
  return (
    <svg width="40" height="52" viewBox="0 0 40 52" aria-hidden className="drop-shadow-[0_2px_2px_rgba(58,47,42,.25)]">
      <defs>
        <linearGradient id={`sw-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={s.a} />
          <stop offset="1" stopColor={s.b} />
        </linearGradient>
      </defs>
      <path d="M8 2 H32 L38 48 Q30 51 20 49 Q10 51 2 48 Z" fill={`url(#sw-${id})`} opacity={id === 'tulle' ? 0.85 : 1} />
      {[11, 16, 20, 24, 29].map((x) => (
        <path key={x} d={`M${x - 2 + (x - 20) * 0.05} 4 L${x + (x - 20) * 0.6} 48`} stroke="rgba(0,0,0,0.12)" strokeWidth="1" />
      ))}
      <rect x="8" y="1" width="24" height="4" rx="1" fill={s.trim} opacity="0.9" />
      {id === 'denim' && <path d="M3 44 Q20 47 37 44" stroke={s.trim} strokeWidth="1" strokeDasharray="2 1.5" fill="none" />}
      {id === 'mamian' && (
        <>
          <rect x="15" y="5" width="10" height="42" fill="#243466" />
          <path d="M3 40 Q20 43 37 40 L38 46 Q20 49 2 46 Z" fill={s.trim} opacity="0.85" />
        </>
      )}
      {id === 'tulle' && [[12, 20], [26, 30], [18, 38], [30, 14]].map(([x, y]) => <circle key={x} cx={x} cy={y} r="0.9" fill="#fff" />)}
    </svg>
  )
}

/** The brass rail and its four wooden hangers (3.5). The empty one is the skirt on the form. */
function Rail({ current, onPick }: { current: FabricId; onPick: (id: FabricId) => void }) {
  return (
    <div className="fixed inset-x-0 top-[7vh] z-10 flex justify-center select-none" onPointerDown={(e) => e.stopPropagation()}>
      <div className="relative flex gap-1 px-3">
        <div aria-hidden className="absolute inset-x-0 top-[3px] h-[5px] rounded-full bg-gradient-to-b from-[#E8C978] via-[#B98E3C] to-[#7A5A22] shadow-[0_2px_3px_rgba(58,47,42,.3)]" />
        {FABRICS.map((id) => {
          const on = id === current
          return (
            <button
              key={id}
              type="button"
              aria-label={t(`twirl_f_${id}` as Key)}
              aria-pressed={on}
              onClick={() => onPick(id)}
              className="relative flex h-[84px] w-[64px] flex-col items-center"
            >
              <div className={`flex origin-top flex-col items-center ${on ? 'twirl-swing' : ''}`}>
                <svg width="44" height="22" viewBox="0 0 44 22" aria-hidden>
                  <path d="M22 9 Q22 2 26 2 Q30 2 29 6" stroke="#7A6A55" strokeWidth="1.6" fill="none" strokeLinecap="round" />
                  <path d="M3 20 L22 9 L41 20 Z" fill="none" stroke="#A8794A" strokeWidth="3" strokeLinejoin="round" />
                </svg>
                <div className={`-mt-[3px] transition-opacity duration-200 ${on ? 'opacity-0' : 'opacity-100'}`}>
                  <Swatch id={id} />
                </div>
              </div>
              <span className={`absolute bottom-0 rounded-sm px-1 text-[10px] leading-[14px] shadow-[0_1px_2px_rgba(58,47,42,.2)] ${on ? 'bg-[#3A2F2A] text-[#FFFDF9]' : 'bg-[#FFFDF9] text-[#3A2F2A]'}`}>
                {t(`twirl_f_${id}` as Key)}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
