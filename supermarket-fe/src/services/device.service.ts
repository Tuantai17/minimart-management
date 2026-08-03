import client from "./api/client";
import { Endpoints } from "./api/endpoints";

export type DeviceType = "ios" | "android" | "web";

type RegisterDevicePayload = {
  token: string;
  device_type: DeviceType;
};

export const deviceService = {
  registerDeviceToken: async ({
    token,
    device_type,
  }: RegisterDevicePayload): Promise<void> => {
    await client.post(Endpoints.DEVICES, {
      token,
      device_type,
    });
  },

  unregisterDeviceToken: async (token: string): Promise<void> => {
    await client.delete(Endpoints.DEVICE_DETAIL(token));
  },
};
