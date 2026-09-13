-- Prepared direct After Effects scripting call. Does not save or replace a project.
on run argv
    if (count of argv) is not 1 then error "Expected one JSX file path"
    set jsxPath to item 1 of argv
    with timeout of 60 seconds
        tell application id "com.adobe.AfterEffectsBeta.application"
            DoScriptFile jsxPath
        end tell
    end timeout
end run
