import React, { useState } from 'react';
import { UserAccount } from '../types';
import { X, Plus, Trash2 } from 'lucide-react';

interface ManageAccountsModalProps {
  accounts: UserAccount[];
  onUpdate: (accounts: UserAccount[]) => void;
  onClose: () => void;
}

export const ManageAccountsModal: React.FC<ManageAccountsModalProps> = ({ accounts, onUpdate, onClose }) => {
  const [localAccounts, setLocalAccounts] = useState<UserAccount[]>(accounts);
  const [newName, setNewName] = useState('');
  const [newRole, setNewRole] = useState('');

  const handleAdd = () => {
    if (!newName.trim()) return;
    const initials = newName.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
    const newAcc: UserAccount = {
      id: `acc-${Date.now()}`,
      name: newName.trim(),
      role: newRole.trim() || 'Team Member',
      initials: initials || '?'
    };
    setLocalAccounts([...localAccounts, newAcc]);
    setNewName('');
    setNewRole('');
  };

  const handleRemove = (id: string) => {
    if (localAccounts.length <= 1) return;
    setLocalAccounts(localAccounts.filter(a => a.id !== id));
  };

  const handleSave = () => {
    onUpdate(localAccounts);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-charcoal-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between p-4 border-b border-sand-200">
          <h2 className="text-lg font-bold text-charcoal-900">Manage Accounts</h2>
          <button onClick={onClose} className="p-2 text-charcoal-500 hover:bg-sand-100 rounded-full transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-4 overflow-y-auto">
          {localAccounts.map(acc => (
            <div key={acc.id} className="flex items-center justify-between p-3 bg-cream-100 border border-sand-200 rounded-xl">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-sand-200 text-charcoal-900 font-bold text-xs flex items-center justify-center border border-sand-300">
                  {acc.initials}
                </div>
                <div>
                  <p className="text-sm font-bold text-charcoal-900">{acc.name}</p>
                  <p className="text-xs text-charcoal-500">{acc.role}</p>
                </div>
              </div>
              {localAccounts.length > 1 && (
                <button onClick={() => handleRemove(acc.id)} className="p-2 text-rose-500 hover:bg-rose-50 rounded-lg">
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          ))}

          <div className="pt-4 border-t border-sand-200 space-y-3">
            <h3 className="text-sm font-bold text-charcoal-900">Add New Account</h3>
            <div className="flex gap-2">
              <input 
                type="text" 
                placeholder="Name" 
                value={newName} 
                onChange={e => setNewName(e.target.value)}
                className="flex-1 px-3 py-2 text-sm bg-white border border-sand-300 rounded-lg focus:border-sage-500"
              />
              <input 
                type="text" 
                placeholder="Role" 
                value={newRole} 
                onChange={e => setNewRole(e.target.value)}
                className="flex-1 px-3 py-2 text-sm bg-white border border-sand-300 rounded-lg focus:border-sage-500"
              />
            </div>
            <button 
              onClick={handleAdd}
              disabled={!newName.trim()}
              className="w-full py-2 px-4 bg-sand-200 hover:bg-sand-300 text-charcoal-800 font-bold text-xs uppercase rounded-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <Plus className="w-4 h-4" /> Add User
            </button>
          </div>
        </div>

        <div className="p-4 border-t border-sand-200 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 font-bold text-xs text-charcoal-600 hover:bg-sand-100 rounded-lg">Cancel</button>
          <button onClick={handleSave} className="px-4 py-2 bg-sage-600 hover:bg-sage-700 text-white font-bold text-xs rounded-lg shadow-xs">Save Changes</button>
        </div>
      </div>
    </div>
  );
};
