# Text field limits

Free-text fields have a maximum length. The API refuses a longer value with a `400` that names the field, for example `notes must be at most 2000 characters`, and the matching web inputs stop accepting characters at the same number. Lengths count characters of the trimmed value, the way a browser `maxLength` counts them.

## Limits

| Kind             | Characters | Fields                                                                                                                                                                         |
| ---------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Names and labels | 100        | Account, debt, goal, holding, pension and category names; banks, lenders, providers, employers, sectors, industries, locations, banking entities and deposit guarantee schemes |
| Person names     | 100        | First and last name                                                                                                                                                            |
| Tickers          | 32         | Holding ticker                                                                                                                                                                 |
| Short codes      | 32         | Colours, units, exchange codes, month keys                                                                                                                                     |
| Addresses        | 200        | Property address                                                                                                                                                               |
| Strategies       | 200        | Pension investment strategy                                                                                                                                                    |
| Descriptions     | 500        | Budget descriptions and merchants, transaction notes on every ledger                                                                                                           |
| Long notes       | 2000       | Debt, pension pot and goal notes                                                                                                                                               |
| Emails           | 254        | Profile, sign-up and partner invitation                                                                                                                                        |
| Emoji            | 8          | Icons                                                                                                                                                                          |
| File names       | 255        | Uploaded document names                                                                                                                                                        |

The numbers are defined once, in `packages/shared/src/domain/textLimits.ts` (`TEXT_LIMITS` by kind, `TEXT_FIELD_LIMITS` by request payload). The request validators in `packages/backend/src/lib/requestValidation.ts` (`checkTextLimits`) and the form inputs read the same constants, so they cannot drift. They sit well above the longest values a typical install holds.

## Existing longer values

The database columns are unchanged, so rows that predate the limits keep their long values. They still display, export and back up, and an edit that sends a long field back unchanged is accepted: the check compares the value with the stored one and refuses it only when it is both over the limit and different. Shortening the value, or leaving the field out of a partial update, also works. Importers and bank sync write through their own paths and are not bounded here.

## Adding a field

Add the field to its payload's map in `TEXT_FIELD_LIMITS`, call `checkTextLimits(parsedBody, TEXT_FIELD_LIMITS.<payload>, existingRow)` in the create and edit handlers (pass the stored row, or a loader for it, on edits), set `maxLength` on the input from the same constant, and add the boundary case to `packages/backend/src/routes/textLimits.integration.test.ts`.
