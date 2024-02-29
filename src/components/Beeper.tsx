export const playSound = () => {
  if (typeof window !== "undefined") {
    const audio = new Audio('/simple-notification.mp3');
    audio.playbackRate = 0.7
    audio.play().catch(err => console.error('Error playing the sound:', err));
  }
};
