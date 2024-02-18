export const playSound = () => {
    if (typeof window !== "undefined") { // Ensures this runs only on the client-side
      const audio = new Audio('/simple-notification.mp3');
      audio.play().catch(err => console.error('Error playing the sound:', err));
    }
  };
  