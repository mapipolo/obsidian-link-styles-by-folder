# Summary
An [[Obsidian]] plugin that allows different link styles to be applied depending on the folder in which a note lives. Two behaviors would be configurable such that, e.g., all notes under `/posts` might use one behavior, while all notes everywhere else use the other.

1. **"Use wikilinks"** (Settings > Files and links > Links > Use \[\[wikilinks\]\])
2. **"New link format"** (Settings > Files and links > Links > New link format)

The motivation for this is *[[Git submodules]]*: submodules are useful for composing knowledge bases from disparate sources such as [[GitLab]] wikis, because [[Git]]Lab wikis have their own link rules that are not the same as the typical Obsidian ones. If I have a couple of GitLab wikis as submodules in my Obsidian vault, I don't want to have to think about what link style I need to use based on context… I want the app to handle that for me. [[Minimize friction]].

# Features
The plugin shall consider these two settings in all `.obsidian/app.json` files appearing anywhere in a vault to have *cascading authority* over link style in all files appearing under those folders:

```json
{
  "useMarkdownLinks": false,   // false|true
  "newLinkFormat": "shortest"  // shortest|relative|absolute
}
```

These settings shall apply when the user:
1. Uses the "Add Internal Link" command
2. Commits a link after using `[[` to insert one
3. Moves a note into a folder subject to a different rule. By default, the app should modify the links in the file to conform to the target style, but this should be configurable ("ask" vs. ")

# Challenges
Is it going to be a performance problem to have to travel upward looking for this setting whenever a link is inserted?

# Design
My first design approach: In every folder where you want the behavior to be different, include a `.obsidian` folder with an `app.json` file and this setting. This has a couple advantages:
1. It's the standard way that things are done. No new settings.
2. It would seamlessly support adding Obsidian vault submodules that already have this setting set in their own way. That way, the child module doesn't have to know anything about this extension that the parent module may use.

An alternate design approach would be to make the plugin independent, but this has the strong disadvantage of not working "out of the box" with submodules that already have their own settings applied the way they need to be. Seems like a killer blow for the independent approach.