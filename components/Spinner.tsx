

import React from 'react';

export const Spinner: React.FC = () => {
  return (
    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
  );
};

export const ThinkingIndicator: React.FC<{ text: string }> = ({ text }) => {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center text-gray-400 space-y-4">
      <div className="flex items-end justify-center space-x-1.5 h-8">
        <div className="w-2 bg-purple-400 animate-think-bar" style={{ animationDelay: '0s' }}></div>
        <div className="w-2 bg-purple-400 animate-think-bar" style={{ animationDelay: '0.1s' }}></div>
        <div className="w-2 bg-purple-400 animate-think-bar" style={{ animationDelay: '0.2s' }}></div>
      </div>
      <p className="text-sm">{text}</p>
    </div>
  );
};