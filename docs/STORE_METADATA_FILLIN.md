# Store Metadata Fill-In

Use this file to capture the exact Partner Center values and public URLs needed before Microsoft Store submission.
Do not mark the Store metadata blocker complete until every required field here has a final value.
The machine-readable version lives in `config/store-metadata.json`, and you can validate it with `npm run store:metadata:check`.
Use `npm run store:metadata` to list the current fields, or `npm run store:metadata -- set --field=<path> --value=<value>` to update one safely.

## Partner Center Identity
- Reserved app name: see `config/store-metadata.json`
- Store identity name (`WINDOWS_STORE_IDENTITY_NAME`): see `config/store-metadata.json`
- Store reserved name (`WINDOWS_STORE_RESERVED_NAME`): see `config/store-metadata.json`
- Publisher (`WINDOWS_PUBLISHER`): see `config/store-metadata.json`
- Submission owner: see `config/store-metadata.json`

## Public URLs
- Privacy policy URL: see `config/store-metadata.json`
- Support URL: see `config/store-metadata.json`
- Support email: see `config/store-metadata.json`
- Product/homepage URL: see `config/store-metadata.json`

## Listing Copy
- Short description owner: see `config/store-metadata.json`
- Full description owner: see `config/store-metadata.json`
- Known issues owner: see `config/store-metadata.json`
- Final copy reviewed date: see `config/store-metadata.json`

## Screenshot Set
- Screenshot owner: see `config/store-metadata.json`
- Capture status: see `config/store-metadata.json`
- Final screenshot review date: see `config/store-metadata.json`

## Compliance Sources
- Privacy policy source: `docs/store/PRIVACY_POLICY_SOURCE.md`
- Store listing draft: `docs/store/STORE_LISTING.md`
- Certification notes: `docs/store/CERTIFICATION_NOTES.md`
- Age rating answers: `docs/store/AGE_RATING_ANSWERS.md`

## Ready-To-Close Checklist
- [ ] Partner Center identity values copied into release secrets/config
- [ ] Privacy policy URL is public and final
- [ ] Support URL is public and final
- [ ] Store listing copy is finalized
- [ ] Screenshot set is captured and reviewed
- [ ] Certification notes reference final package evidence
