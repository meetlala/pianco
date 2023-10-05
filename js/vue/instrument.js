// uses global.Tone
import { allOff, instruments } from '../instrument.js'


export const instrumentApp = new Vue({
  el: '#instrument-app',
  data: {
    muted: false,
    volume: 100,
    minVolume: 0,
    maxVolume: 100,
    stepVolume: 5,
    instrument: 'none',
    midiEnabled: true,
    midiTooltip: 'MIDI in',
    isFramed: window.parent !== window,
  },
  computed: {
  },
  watch: {
    instrument (newInstrument, oldInstumen) {
      if (this.instrument === 'Salamander piano') {
        setTimeout(() => {
          document.querySelector('.loader').style.display = "none"
          const overlay = document.querySelector('.framed .kick-start')
          if (overlay) {
            overlay.style.display = "flex"
            overlay.addEventListener("click", () => {
              overlay.style.display = "none"
            })
          }
          document.querySelector('.content').style.display = "flex"
          const footer = document.querySelector('body.framed footer')
          if (footer) {
            footer.style.display = "flex"
          }
        }, 0)
      }
      allOff()
      // TODO - blur on click?
    },
    volume (newVolume, oldVolume) {
      const toDb = (v) => (v / 100 * 40 - 40) // 0..100 % to -40..0 dB
      if (oldVolume === newVolume) {
        return
      }
      Tone.getDestination().volume.value = toDb(newVolume)
      if (newVolume <= +this.minVolume) {
        Tone.getDestination().mute = true
      } else {
        Tone.getDestination().mute = false
      }
    }
  },
  methods: {
    changeInstrument (e) {
      const instrumentNames = Object.keys(instruments)
        .filter(name => name !== 'none')
        .filter(name => this.midiEnabled || name !== 'midiout')
      const index = instrumentNames.indexOf(this.instrument)
      const nextInstrument = instrumentNames[(index+1) % instrumentNames.length]
      this.instrument = nextInstrument
    },
    scrollVolume (e) {
      if (this.muted) {
        return
      }
      // TODO - normalize deltaY (may differ browser from browser)
      const val = Math.max(
        +this.minVolume,
        Math.min(
          Math.sign(-e.deltaY) * +this.stepVolume + +this.volume,
          +this.maxVolume,
        ),
      )
      this.volume = val
    },
    toggleMute () {
      this.muted = !this.muted
      if (this.muted) {
        Tone.getDestination().mute = true
      } else {
        Tone.getDestination().mute = false
      }
    },
  },
})
