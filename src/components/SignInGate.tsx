import React, { useState } from 'react';
import { UserAccount } from '../types';
import { KeyRound, ShieldCheck, Lock, AlertCircle, Building2, UserCheck } from 'lucide-react';

interface SignInGateProps {
  accounts: UserAccount[];
  onSignInSuccess: (accountId: string) => void;
}

export const SignInGate: React.FC<SignInGateProps> = ({ accounts, onSignInSuccess }) => {
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSignIn = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAccountId) {
      setErrorMessage('Please select an account to sign in.');
      return;
    }

    const account = accounts.find((a) => a.id === selectedAccountId);
    if (!account) {
      setErrorMessage('Account not found.');
      return;
    }

    if (password === account.password) {
      setErrorMessage(null);
      onSignInSuccess(account.id);
    } else {
      setErrorMessage('Incorrect password');
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-cream-100 flex flex-col items-center justify-center p-4 sm:p-6 overflow-y-auto">
      <div className="w-full max-w-md bg-white border border-sand-300 rounded-3xl shadow-xl p-6 sm:p-8 space-y-6 animate-in fade-in zoom-in-95 duration-200">
        
        {/* Company & System Header */}
        <div className="text-center space-y-2 border-b border-sand-200 pb-5">
          <div className="w-14 h-14 bg-sage-600 text-white rounded-2xl flex items-center justify-center mx-auto shadow-md">
            <Building2 className="w-7 h-7" />
          </div>
          <div>
            <span className="text-[10px] font-extrabold uppercase tracking-widest text-sage-800 bg-sage-100 px-3 py-1 rounded-full border border-sage-200">
              Boon Huat Hardware Pte Ltd
            </span>
            <h1 className="text-xl font-extrabold text-charcoal-900 mt-2">
              Boon Huat Invoice Intake
            </h1>
            <p className="text-xs text-charcoal-500 font-medium">
              Accounts Payable Verification & Google Sheets Sync Tool
            </p>
          </div>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSignIn} className="space-y-5">
          {/* Account Selection */}
          <div className="space-y-2">
            <label className="block text-xs font-extrabold uppercase tracking-wider text-charcoal-700 flex items-center gap-1.5">
              <UserCheck className="w-4 h-4 text-sage-600" />
              <span>Select Account:</span>
            </label>

            <div className="space-y-2">
              {accounts.map((acc) => {
                const isSelected = selectedAccountId === acc.id;
                return (
                  <label
                    key={acc.id}
                    onClick={() => {
                      setSelectedAccountId(acc.id);
                      if (errorMessage) setErrorMessage(null);
                    }}
                    className={`flex items-center justify-between p-3.5 rounded-2xl border transition-all cursor-pointer select-none ${
                      isSelected
                        ? 'bg-sage-50/80 border-sage-500 shadow-xs ring-1 ring-sage-500'
                        : 'bg-cream-50 border-sand-200 hover:bg-sand-50 hover:border-sand-300'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <input
                        type="radio"
                        name="account-select"
                        checked={isSelected}
                        onChange={() => {
                          setSelectedAccountId(acc.id);
                          if (errorMessage) setErrorMessage(null);
                        }}
                        className="w-4 h-4 text-sage-600 focus:ring-sage-500 cursor-pointer"
                      />
                      <div className="w-8 h-8 rounded-full bg-sand-200 text-charcoal-900 font-bold text-xs flex items-center justify-center border border-sand-300 shrink-0">
                        {acc.initials}
                      </div>
                      <div>
                        <p className="text-xs font-bold text-charcoal-900 leading-tight">
                          {acc.name}
                        </p>
                        <p className="text-[10px] text-charcoal-500 font-medium">
                          {acc.role}
                        </p>
                      </div>
                    </div>
                    {isSelected && (
                      <span className="text-[10px] font-extrabold text-sage-700 bg-sage-100 px-2 py-0.5 rounded-md border border-sage-200">
                        Selected
                      </span>
                    )}
                  </label>
                );
              })}
            </div>
          </div>

          {/* Password Input */}
          <div className="space-y-1.5">
            <label className="block text-xs font-extrabold uppercase tracking-wider text-charcoal-700 flex items-center gap-1.5">
              <KeyRound className="w-4 h-4 text-sage-600" />
              <span>Password:</span>
            </label>
            <div className="relative">
              <input
                type="password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (errorMessage) setErrorMessage(null);
                }}
                placeholder="Enter password"
                className={`w-full px-4 py-3 text-sm bg-cream-50 border rounded-xl focus:ring-2 focus:bg-white text-charcoal-900 font-mono transition-all ${
                  errorMessage
                    ? 'border-rose-400 focus:ring-rose-400/30'
                    : 'border-sand-300 focus:ring-sage-500/30 focus:border-sage-500'
                }`}
              />
              <Lock className="w-4 h-4 text-charcoal-400 absolute right-3.5 top-3.5 pointer-events-none" />
            </div>

            {errorMessage && (
              <p className="text-xs font-bold text-rose-600 flex items-center gap-1.5 mt-1.5 bg-rose-50 border border-rose-200 p-2.5 rounded-xl">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{errorMessage}</span>
              </p>
            )}
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            className="w-full py-3.5 bg-sage-600 hover:bg-sage-700 active:bg-sage-800 text-white font-extrabold text-xs uppercase tracking-wider rounded-xl shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer mt-2"
          >
            <ShieldCheck className="w-4 h-4" />
            <span>Sign In</span>
          </button>
        </form>

        {/* Footer info */}
        <div className="text-center pt-2 border-t border-sand-100 text-[11px] text-charcoal-400 font-medium">
          Protected AP Processing System &bull; Boon Huat Hardware Pte Ltd
        </div>
      </div>
    </div>
  );
};
