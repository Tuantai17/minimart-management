export interface Address {
  id: number;
  full_name: string;
  phone: string;
  province: string;
  district: string;
  street: string;
  note?: string;
  is_default: boolean;
  lat?: number | null;
  lng?: number | null;
  created_at: string;
}

export interface CreateAddressPayload {
  full_name: string;
  phone: string;
  province: string;
  district: string;
  street: string;
  note?: string;
  is_default?: boolean;
  lat?: number | null;
  lng?: number | null;
}

export interface UpdateAddressPayload extends Partial<CreateAddressPayload> {}
