import { registerDecorator, ValidationArguments, ValidationOptions } from 'class-validator';

export function isValidCnpj(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const digits = value.replace(/\D/g, '');
  if (digits.length !== 14 || /^(\d)\1{13}$/.test(digits)) return false;

  const calculateDigit = (length: number): number => {
    let factor = length - 7;
    let sum = 0;
    for (let index = 0; index < length; index += 1) {
      sum += Number(digits[index]) * factor;
      factor = factor === 2 ? 9 : factor - 1;
    }
    const remainder = sum % 11;
    return remainder < 2 ? 0 : 11 - remainder;
  };

  return calculateDigit(12) === Number(digits[12]) && calculateDigit(13) === Number(digits[13]);
}

export function isValidCep(value: unknown): boolean {
  return typeof value === 'string' && /^\d{5}-?\d{3}$/.test(value);
}

function validator(name: string, validate: (value: unknown) => boolean, message: string) {
  return (validationOptions?: ValidationOptions): PropertyDecorator =>
    (target: object, propertyName: string | symbol) => registerDecorator({
      name,
      target: target.constructor,
      propertyName: String(propertyName),
      options: { message, ...validationOptions },
      validator: { validate: (value: unknown, _args: ValidationArguments) => validate(value) },
    });
}

export const IsCnpj = validator('isCnpj', isValidCnpj, '$property must be a valid CNPJ');
export const IsCep = validator('isCep', isValidCep, '$property must be a valid CEP');
