# dsh-ponytail

Ponytail for DeepSeek Harness. Always-on lazy-coding rules, plus five one-shot skills.

- `/ponytail` — show current mode
- `/ponytail lite|full|ultra|off` — change intensity
- Skills: `ponytail-review`, `ponytail-audit`, `ponytail-debt`, `ponytail-gain`, `ponytail-help`

Mode is stored in settings (`ponytail.mode`). Rules inject through `systemPrompt.section`, so they apply every turn without bloating chat history.

Upstream skill text: [DietrichGebert/ponytail](https://github.com/DietrichGebert/ponytail).
