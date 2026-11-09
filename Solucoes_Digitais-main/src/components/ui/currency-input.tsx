import { useEffect, useState } from 'react';
import { Input, type InputProps } from '@/components/ui/input';

type CurrencyInputProps = Omit<InputProps, 'value' | 'onChange' | 'type'> & {
  value: number;
  onValueChange: (value: number) => void;
};

const currencyFormatter = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function toDigits(value: number) {
  return String(Math.round(Math.max(0, value) * 100));
}

export function CurrencyInput({ value, onValueChange, ...props }: CurrencyInputProps) {
  const [digits, setDigits] = useState(() => toDigits(value));

  useEffect(() => {
    setDigits(toDigits(value));
  }, [value]);

  const cents = Number(digits) || 0;

  return (
    <Input
      {...props}
      type="text"
      inputMode="numeric"
      value={currencyFormatter.format(cents / 100)}
      onChange={(event) => {
        const nextDigits = event.target.value.replace(/\D/g, '');
        setDigits(nextDigits);
        onValueChange((Number(nextDigits) || 0) / 100);
      }}
    />
  );
}
