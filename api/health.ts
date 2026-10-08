import { handle } from '../server/http.ts';
export default { fetch: (request: Request) => handle(request, process.env) };
