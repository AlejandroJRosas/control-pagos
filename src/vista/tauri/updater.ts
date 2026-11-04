export type Update = { version: string; close: () => Promise<void> };
export const check = async (): Promise<Update | null> => null;
