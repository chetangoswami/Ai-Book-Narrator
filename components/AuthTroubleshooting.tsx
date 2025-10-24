import React from 'react';
import { WarningIcon } from './icons';

interface AuthTroubleshootingProps {
  message: string;
}

export const AuthTroubleshooting: React.FC<AuthTroubleshootingProps> = ({ message }) => {
  return (
    <div className="m-4 p-4 bg-red-900/40 border border-red-700/60 rounded-lg flex items-start gap-4">
      <WarningIcon className="w-6 h-6 text-red-400 mt-1 flex-shrink-0" />
      <div>
        <h3 className="font-bold text-red-300">
          Configuration Error
        </h3>
        <p className="text-sm text-red-300/90">
          {message}
        </p>
      </div>
    </div>
  );
};