import { recorder } from '../io.js'

export const recorderApp = new Vue({
  el: '#recorder-app',
  data: {
    isRecording: false,
    isPlaying: false,
    visible: false,
  },
  methods: {
    reset () {
      this.isRecording = false
      this.isPlaying = false
    },
    toggleRecord() {
      if (this.isRecording || this.isPlaying) {
        recorder.stop();
        this.isRecording = false;
        this.isPlaying = false;
      } else {
        recorder.record();
        this.isRecording = true;
        this.isPlaying = false;
      }
    },
    togglePlay() {
      if (this.isPlaying) {
        recorder.pause();
        this.isPlaying = false;
      } else {
        recorder.replay();
        this.isPlaying = true;
        this.isRecording = false;
      }
    },
    togglePlayUp() {
      if (this.isPlaying) {
        recorder.pause();
        this.isPlaying = false;
      } else {
        recorder.replayUp();
        this.isPlaying = true;
        this.isRecording = false;
      }
    },
    togglePlayDown() {
      if (this.isPlaying) {
        recorder.pause();
        this.isPlaying = false;
      } else {
        recorder.replayDown();
        this.isPlaying = true;
        this.isRecording = false;
      }
    },
  }
})

