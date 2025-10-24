import React from 'react';

interface ProgressBarProps {
  progress: number;
  className?: string;
  showPercentage?: boolean;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({ progress, className = '', showPercentage = true }) => {
  // A progress of 0 usually means not started, so we don't render.
  // The hook resets to 0 after completion.
  if (progress === 0) return null;

  const displayProgress = Math.floor(progress);

  return (
    <div className={`flex items-center w-full gap-4 ${className}`}>
      <div className="flex-1 bg-gray-700 rounded-full h-2.5" role="progressbar" aria-valuenow={displayProgress} aria-valuemin={0} aria-valuemax={100}>
        <div
          className="bg-gradient-to-r from-purple-500 to-indigo-600 h-2.5 rounded-full transition-width duration-300 ease-linear"
          style={{ width: `${displayProgress}%` }}
        ></div>
      </div>
      {showPercentage && (
        <span className="text-sm font-semibold text-gray-300 w-12 text-right tabular-nums">
          {displayProgress}%
        </span>
      )}
    </div>
  );
};