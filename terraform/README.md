# hydrantenmap Infrastructure as Code

## Requirements

- Opentofu

```bash
# ensure direnv
direnv allow
# init
tofu init
# check changes
tofu plan -out tfplan
# apply
tofu apply tfplan
```
