export const join = async (...p: string[]) => p.join("/");
export const dirname = async (p: string) => p.split("/").slice(0, -1).join("/");
