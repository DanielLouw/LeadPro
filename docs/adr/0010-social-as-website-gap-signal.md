# `social_as_website` as a distinct hard gap signal

When a business lists a social or directory URL (Facebook, Instagram, Yelp, etc.) as their "website" in Google Places, the gap analyzer previously treated it as a live website — the URL returns HTTP 200, so no `no_website` or `broken_website` signal fired. This was a false negative: the business has no real web presence of their own.

We added `social_as_website` as a distinct hard gap signal rather than folding it into `no_website` because the sales context is meaningfully different: the business is actively using a social platform as a substitute for a website, which is a useful conversation hook ("you're sending potential customers to a Facebook page you don't control"). The `no_website` signal assumes the business has no online presence at all; `social_as_website` assumes they have a presence but in the wrong place. Both map to Website Build, but with different sales copy.

## Considered options

**Fold into `no_website`:** Simpler — one signal covers "no real website" in all its forms. Rejected because the sales copy for `no_website` ("every customer who searches online hits a dead end") is inaccurate for a business that does have a Facebook page with reviews and photos. Different pitch, different signal.

**Fold into `broken_website`:** Also considered — the URL isn't their site, so it's "broken" in a sense. Rejected because `broken_website` implies a technical failure the business may not be aware of; `social_as_website` is a deliberate choice that deserves a different framing.
