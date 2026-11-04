export const getCurrentWebview = () => ({
  setZoom: async (z: number) => {
    document.documentElement.style.zoom = String(z);
  },
});
