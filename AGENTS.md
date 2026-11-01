<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Keep session timing in a shell-mounted hook using wall-clock elapsed time, so tab changes and suspended browser callbacks cannot reset or slow the active session.
- Keep screen styling in semantic global design tokens and scoped screen classes, using the shared Button for interactions, so visual redesigns leave session and profile logic unchanged.
