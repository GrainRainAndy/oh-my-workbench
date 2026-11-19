#include <ApplicationServices/ApplicationServices.h>
#include <Carbon/Carbon.h>
#include <stdio.h>

int main(void) {
    if (!CGPreflightPostEventAccess()) {
        fputs("macOS event posting permission unavailable\n", stderr);
        return 77;
    }
    CGEventFlags flags = kCGEventFlagMaskControl | kCGEventFlagMaskAlternate |
                         kCGEventFlagMaskShift | kCGEventFlagMaskCommand;
    for (int down = 1; down >= 0; --down) {
        CGEventRef event = CGEventCreateKeyboardEvent(NULL, kVK_Space, down);
        if (!event) return 1;
        CGEventSetFlags(event, flags);
        CGEventPost(kCGHIDEventTap, event);
        CFRelease(event);
    }
    return 0;
}
