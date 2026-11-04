export const UserAttentionType = { Critical: 1, Informational: 2 } as const;
export const getCurrentWindow = () => ({
  onCloseRequested: async () => () => {},
  destroy: async () => {},
  requestUserAttention: async () => {},
});
