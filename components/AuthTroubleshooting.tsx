import React from 'react';
import { WarningIcon } from './icons';

interface AuthTroubleshootingProps {
  error: string | null;
}

export const AuthTroubleshooting: React.FC<AuthTroubleshootingProps> = ({ error }) => {
  const isError = !!error;
  const bgColor = isError ? 'bg-red-900/40' : 'bg-yellow-900/40';
  const borderColor = isError ? 'border-red-700/60' : 'border-yellow-700/60';
  const iconColor = isError ? 'text-red-400' : 'text-yellow-400';
  const titleColor = isError ? 'text-red-300' : 'text-yellow-300';
  const textColor = isError ? 'text-red-300/90' : 'text-yellow-300/90';

  return (
    <div className={`m-4 p-4 ${bgColor} border ${borderColor} rounded-lg flex items-start gap-4`}>
      <WarningIcon className={`w-6 h-6 ${iconColor} mt-1 flex-shrink-0`} />
      <div>
        <h3 className={`font-bold ${titleColor}`}>
          {isError ? 'Sign-In Failed' : 'Troubleshooting Sign-In'}
        </h3>
        <p className={`text-sm ${textColor}`}>
          {error
            ? error
            : "If the sign-in pop-up closes unexpectedly, first check if your browser is blocking pop-ups. Most commonly, you need to add this app's domain to the 'Authorized domains' list in your Firebase project's Authentication settings."}
        </p>
      </div>
    </div>
  );
};
