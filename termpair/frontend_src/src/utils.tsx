import { toast } from "react-toastify";
import { debounce } from "debounce";
export function websocketUrlFromHttpUrl(httpUrl: URL) {
  return new URL(httpUrl.toString().replace(/^http/, "ws"));
}

export const toastStatus = debounce((status: any) => {
  toast.dark(status);
}, 100);
