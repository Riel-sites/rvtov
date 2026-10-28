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

- Keep legal content in public /privacy and /terms routes with a shared LegalPage layout and footer links, so policies remain accessible without signing in.
- Keep confirmed launch policy values in the browser-safe launch-policies module and test their concrete rules independently of page copy.
- Catalog read policies expose categories to signed-out visitors only when referenced by published products; anonymous product-file reads require a matching published product image, while authenticated product-file reads are owner-or-admin only, preserving the user's selected access boundaries.
