import { useLocation } from "wouter";

export function usePathname() {
  const [location] = useLocation();
  return location;
}

export function useSearchParams() {
  return new URLSearchParams(window.location.search);
}
