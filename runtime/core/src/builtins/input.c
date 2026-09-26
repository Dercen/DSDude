// input.c: button and touch builtins. They read the input sampled once at the start of the frame (contracts/events.md
// step 1), so every event of a frame sees the same state. Buttons are the btn_* values 0-11; others are never held.
#include "bi.h"
#include "engine.h"

// The three views of a button: held now, went down this frame, went up this frame.
#define VIEW_HELD 0
#define VIEW_PRESSED 1
#define VIEW_RELEASED 2

static bool button_view(DsdVm *vm, uint32_t bi, DsdValue *args, int view) {
    int32_t b;
    if (!dsd_bi_arg_int(vm, bi, args, 0, &b)) return false;
    const DsdEngine *e = &dsd_engine;
    uint32_t mask = view == VIEW_HELD ? e->input.held
                    : view == VIEW_PRESSED ? e->input.held & ~e->held_prev
                                           : e->held_prev & ~e->input.held;
    args[0] = dsd_bool(b >= 0 && (uint32_t)b < DSD_BTN_COUNT && ((mask >> b) & 1u));
    return true;
}

bool dsd_bi_button_check(DsdVm *vm, DsdValue *args, uint32_t argc) {
    (void)argc;
    return button_view(vm, DSD_BI_button_check, args, VIEW_HELD);
}

bool dsd_bi_button_pressed(DsdVm *vm, DsdValue *args, uint32_t argc) {
    (void)argc;
    return button_view(vm, DSD_BI_button_pressed, args, VIEW_PRESSED);
}

bool dsd_bi_button_released(DsdVm *vm, DsdValue *args, uint32_t argc) {
    (void)argc;
    return button_view(vm, DSD_BI_button_released, args, VIEW_RELEASED);
}

bool dsd_bi_touch_check(DsdVm *vm, DsdValue *args, uint32_t argc) {
    (void)vm;
    (void)argc;
    args[0] = dsd_bool(dsd_engine.input.touching != 0);
    return true;
}

bool dsd_bi_touch_pressed(DsdVm *vm, DsdValue *args, uint32_t argc) {
    (void)vm;
    (void)argc;
    args[0] = dsd_bool(dsd_engine.input.touching && !dsd_engine.touching_prev);
    return true;
}

bool dsd_bi_touch_released(DsdVm *vm, DsdValue *args, uint32_t argc) {
    (void)vm;
    (void)argc;
    args[0] = dsd_bool(!dsd_engine.input.touching && dsd_engine.touching_prev);
    return true;
}

bool dsd_bi_touch_in_instance(DsdVm *vm, DsdValue *args, uint32_t argc) {
    uint32_t idx = vm->self;
    if (argc > 0) {
        uint16_t one;
        idx = dsd_engine_targets(args[0], &one, 1) == 1 ? one : DSD_NO_INST;
    }
    args[0] = dsd_bool(idx != DSD_NO_INST && dsd_engine_stylus_on(idx));
    return true;
}
