'use client';
import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

type Props = {
  value: string; onChange: (v: string) => void; placeholder?: string; autoComplete?: string; id?: string; name?: string; required?: boolean; disabled?: boolean;
};

/** Password field with a show/hide eye button. */
export default function PasswordInput({ value, onChange, placeholder = 'Password', autoComplete = 'current-password', id, name, required, disabled }: Props) {
  const [visible, setVisible] = useState(false);
  return (
    <div style={{ position: 'relative' }}>
      <input
        className="input" style={{ paddingRight: 48 }} id={id} name={name} required={required} disabled={disabled}
        type={visible ? 'text' : 'password'} value={value} onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder} autoComplete={autoComplete}
      />
      <button
        type="button" onClick={() => setVisible((v) => !v)} aria-label={visible ? 'Password chhupayein' : 'Password dikhayein'} aria-pressed={visible}
        style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', width: 36, height: 36, display: 'grid', placeItems: 'center', border: 0, background: 'transparent', cursor: 'pointer', color: '#6b7a71', borderRadius: 10 }}
      >
        {visible ? <EyeOff size={18} /> : <Eye size={18} />}
      </button>
    </div>
  );
}
