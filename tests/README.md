# Tests

`journeys.js` walks the user journeys defined in `app/warmind/data/logic.yaml` (the same ones the
Logic tab draws). Every journey step with a `probe` is opened at 360 and 448 px and must render its
`expect` selector with no page errors and no sideways scroll.

```
cd app && WARMIND_DB=/tmp/journeys.db WARMIND_VISION_MOCK=1 python -m uvicorn server:app --port 8099 &
node tests/journeys.js http://localhost:8099
```

It builds its own profile, war table and debrief through the API. In mock mode that costs nothing.
Add a step (with a probe) to a journey in `logic.yaml` and it's covered here and shown on the Logic tab.
