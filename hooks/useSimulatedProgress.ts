import { useState, useEffect, useRef } from 'react';

/**
 * A hook to simulate loading progress for async operations.
 * @param isLoading - A boolean that is true while the operation is in progress.
 * @returns A number from 0 to 100 representing the simulated progress.
 */
export const useSimulatedProgress = (isLoading: boolean): number => {
  const [progress, setProgress] = useState(0);
  const intervalRef = useRef<number>();

  useEffect(() => {
    if (isLoading) {
      // Reset and start the progress simulation
      setProgress(0);
      
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }

      intervalRef.current = window.setInterval(() => {
        setProgress(prev => {
          // Don't let it reach 100, as that signifies completion
          if (prev >= 99) {
            clearInterval(intervalRef.current);
            return 99;
          }
          
          // Increment slows down as it gets closer to 100
          let increment;
          if (prev < 60) {
            increment = Math.random() * 4 + 1; // Faster at the beginning
          } else if (prev < 90) {
            increment = Math.random() * 1.5 + 0.5; // Slows down
          } else {
            increment = Math.random() * 0.5; // Creeps towards the end
          }
          
          return Math.min(prev + increment, 99);
        });
      }, 200);

    } else {
      // Operation is finished, complete the progress bar
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }

      // Only animate to 100 if it was actually in progress
      if (progress > 0 && progress < 100) {
          setProgress(100);
          // After a short delay to show 100%, reset to 0.
          const timer = setTimeout(() => setProgress(0), 500);
          return () => clearTimeout(timer);
      } else {
        // If it was already 0 or 100, just make sure it ends at 0.
        setProgress(0);
      }
    }

    // Cleanup interval on unmount or when isLoading changes
    return () => {
        if (intervalRef.current) {
            clearInterval(intervalRef.current);
        }
    };
  }, [isLoading]);

  return progress;
};