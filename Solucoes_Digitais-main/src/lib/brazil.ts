export function digitsOnly(value: string) {
  return value.replace(/\D/g, '');
}

export function formatPostalCode(value: string) {
  const digits = digitsOnly(value).slice(0, 8);
  return digits.length > 5 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : digits;
}

export async function lookupPostalAddress(postalCode: string) {
  const digits = digitsOnly(postalCode);
  if (digits.length !== 8) throw new Error('Informe um CEP com 8 números');

  const response = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
  if (!response.ok) throw new Error('Não foi possível consultar o CEP');

  const data: {
    erro?: boolean;
    logradouro?: string;
    bairro?: string;
    localidade?: string;
    uf?: string;
  } = await response.json();

  if (data.erro) throw new Error('CEP não encontrado');

  const streetAndDistrict = [data.logradouro, data.bairro].filter(Boolean).join(', ');
  const cityAndState = [data.localidade, data.uf].filter(Boolean).join(' - ');
  return [streetAndDistrict, cityAndState].filter(Boolean).join(', ');
}
