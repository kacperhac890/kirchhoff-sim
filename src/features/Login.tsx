import { useState } from 'react';
import { ArrowRight, ShieldCheck } from 'lucide-react';
import { useApp } from '../store/store';
import { Button, Field, Input } from '../ui/kit';
import { Brand } from '../ui/Brand';

export function Login() {
  const login = useApp((s) => s.login);
  const [name, setName] = useState('');
  const [emp, setEmp] = useState('');
  const [touched, setTouched] = useState(false);
  const nameErr = name.trim().length < 2 ? 'Enter your name (at least 2 characters).' : undefined;
  const empErr = !/^[A-Za-z0-9-]{3,12}$/.test(emp.trim()) ? 'Use 3–12 letters, digits or dashes, e.g. E-1042.' : undefined;
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (nameErr || empErr) return;
    login(name.trim(), emp.trim().toUpperCase());
  };
  return (
    <div className="flex min-h-full items-center px-6 py-10 md:px-16">
      <div className="w-full max-w-[440px] rise-in">
        <Brand large />
        <h1 className="mt-10 text-2xl font-semibold tracking-[-0.015em] text-ink">Start your first shift</h1>
        <p className="mt-2 max-w-[52ch] text-base text-ink-2">
          Run a simulated automotive structural-parts plant through an SAP-inspired ERP. Receive steel, plan presses and weld cells, inspect, store and ship — every transaction moves the factory.
        </p>
        <form onSubmit={submit} className="mt-8 flex flex-col gap-4" noValidate>
          <Field label="Your name" required error={touched ? nameErr : undefined}>
            {(id) => <Input id={id} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" placeholder="Anna Nowak" autoFocus />}
          </Field>
          <Field label="Employee ID" required error={touched ? empErr : undefined} hint="Your progress is saved under this ID on this device.">
            {(id) => <Input id={id} value={emp} onChange={(e) => setEmp(e.target.value)} autoComplete="username" placeholder="E-1042" className="mono" />}
          </Field>
          <Button type="submit" variant="primary" className="mt-2 h-10 text-base" icon={<ArrowRight className="size-4" />}>
            Clock in
          </Button>
        </form>
        <div className="mt-10 flex gap-2.5 border-t border-line-soft pt-5 text-xs text-ink-3">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-ink-4" aria-hidden />
          <p className="max-w-[60ch]">
            Educational simulation inspired by publicly known automotive manufacturing technologies (stamping, press hardening, robotic welding, KTL e-coat). Plant layout, machine IDs, recipes, suppliers, customers and SAP configuration are invented for training and are not KIRCHHOFF Automotive internal data.
          </p>
        </div>
      </div>
    </div>
  );
}
