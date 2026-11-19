#include <Carbon/Carbon.h>
#include <stdio.h>

int main(void) {
    EventHotKeyRef key;
    EventHotKeyID id = { 'WbQA', 1 };
    OSStatus status = RegisterEventHotKey(kVK_Space, controlKey | optionKey | shiftKey | cmdKey,
        id, GetApplicationEventTarget(), kEventHotKeyExclusive, &key);
    printf("%d\n", (int)status);
    fflush(stdout);
    if (status != noErr) return 1;
    getchar();
    return UnregisterEventHotKey(key) == noErr ? 0 : 1;
}
