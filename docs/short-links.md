# Short links (`#s=`)

A shared link comes in two shapes.

| | `#p=<payload>` | `#s=<id>` |
|---|---|---|
| length | ~2.2 characters per object — 375 for a 173-object layout | 11 characters, always |
| needs a server | no | yes, to read it back |
| leaves the browser | never | the plan is stored on the server |
| lifetime | forever | as long as the store's volume exists |

Both work, and the app prefers `#s=`, falling back to `#p=` whenever the
server will not take the plan. See `shareTarget` in `src/core/short-link.ts`.

## Why a short link cannot just be a smaller encoding

A hash is not decodable, and neither is anything else at that size. A plan of
173 objects has at least ~199 bytes of entropy (measured — see the note on
`packPlanBinary` in `src/core/serialize.ts`), and 100 base64 characters hold
75 bytes. No function maps every layout into 8 characters and back; some
would have to collide, and a collision means two warehouses decoding to one.

`#s=` is short because it does not carry the plan. It is a lookup key, and the
layout lives on the server's disk. That is the entire trick, and the reason
this needs storage at all.

## Deployment: THE VOLUME IS NOT OPTIONAL

Layouts are written to `PARCELPLANNER_LINK_DIR`, defaulting to `.data/links`
under the working directory. See `.env.example`; in Dokploy this goes in
Environment. The domain needs no configuration — the Share button builds
links from whatever address the page is served on, so a move to a new domain
works with no change.

Dokploy builds a fresh container on every deploy. **If that directory is not a
persistent volume, every deploy wipes the store**, and unlike most data loss
this one is silent and other people's: every `#s=` link anyone has already
sent stops working, with nothing to restore from. Existing `#p=` links are
unaffected — they never needed the server.

In Dokploy, on the application: **Advanced → Volumes → Add**, mount path
`/app/.data`, then redeploy. Or set `PARCELPLANNER_LINK_DIR` to wherever the
volume is mounted.

Back that volume up like any other data. A hundred thousand layouts is about
30 MB, so a copy of the whole directory is a cheap backup.

## What is stored

One file per layout, at `<dir>/<first two characters of id>/<id>`, holding the
same base64url payload a `#p=` link would have carried. The id is the first 8
characters of the payload's SHA-256, so:

- sharing an unchanged plan twice writes one file and returns one link;
- an entry can never change, which is why the GET is served `immutable`;
- nothing needs to be generated, remembered, or invalidated.

If two different plans ever agree on those 8 characters, the store notices and
uses 9 (`src/server/link-store.ts`). Both plans keep working.

## The endpoint is public

`POST /api/link` accepts a plan from anyone, so it is bounded on three sides:

- **shape** — the body must be base64url and at most `MAX_FRAGMENT_LENGTH`;
- **rate** — 30 writes a minute per `x-forwarded-for` address, counted in
  memory. This is per process. Behind more than one instance the effective
  limit multiplies, which is the point at which it should become something
  shared rather than something larger;
- **volume** — 100 000 entries, after which writes answer `507` and clients
  fall back to `#p=`. A full store still serves every link already made.

None of these protect data — there is none to protect, a stored layout is
public the moment its link is sent. They exist so that filling the disk, which
would take the whole site down, is not a loop.

## Privacy

`#p=` links never reach the server: a URL fragment is not sent in the request,
so those layouts stay out of Dokploy's logs and every proxy in between. `#s=`
links are the opposite by construction — the plan is on the server. It is
warehouse layouts, not secrets, but it is a real difference and the reason
`#p=` is kept rather than retired.
