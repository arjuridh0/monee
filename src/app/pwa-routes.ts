/** Authentication and API navigations must reach the network, never the cached app shell. */
export const navigationDenylist = [/^\/api(?:[/?]|$)/, /^\/cdn-cgi\//, /^\/auth\/refresh(?:[/?]|$)/]
