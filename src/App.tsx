import { useEffect, useRef, useState } from 'react'
import { MoreMenu } from './components/MoreMenu'
import { Hint } from './components/Hint'
import { applyMeta, t } from './i18n'
import { startAnalytics, track } from './analytics'
import { startGame } from './game'

const SHOT = new URLSearchParams(location.search).has('shot')

export default function App() {
  const ref = useRef<HTMLCanvasElement>(null)
  const [touched, setTouched] = useState(false)
  const [nogl, setNogl] = useState(false)
  const [label, setLabel] = useState('')
  useEffect(() => {
    applyMeta('twirl')
    startAnalytics('twirl')
    return startGame(ref.current!, {
      onFirstTouch: () => {
        setTouched(true)
        track('play_start')
      },
      onNoGL: () => {
        setNogl(true)
        track('no_webgl')
      },
      label: new URLSearchParams(location.search).get('label') === '0' ? undefined : setLabel,
    })
  }, [])
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
      {!SHOT && <Hint text={t('hint_twirl')} hidden={touched} toy="twirl" />}
      {!SHOT && <MoreMenu current="twirl" />}
    </>
  )
}
