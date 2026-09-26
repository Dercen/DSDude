// trace.c: the --trace JSON Lines writer (contracts/log-protocol.md "Traces"): one object per frame, keys in a fixed
// order, integers only, LF endings (the file is opened "wb"), so traces compare byte for byte across hosts.
#include <inttypes.h>
#include <stdio.h>

#include "dsd_random.h"
#include "engine.h"
#include "host.h"

// One instance: [id, object, x, y, screen, sprite, image, visible, depth]; x, y and image are Q20.12 raw values.
static int write_inst(FILE *f, const DsdInstance *in, bool first) {
    return fprintf(f, "%s[%" PRId32 ",%u,%" PRId32 ",%" PRId32 ",%u,%" PRId32 ",%" PRId32 ",%u,%" PRId32 "]",
                   first ? "" : ",", in->id, (unsigned)in->object, in->x, in->y, (unsigned)in->screen,
                   in->sprite_index, in->image_index, (unsigned)in->visible, in->depth);
}

bool host_trace_frame(FILE *f, uint32_t frame) {
    const DsdEngine *e = &dsd_engine;
    const dsd_input *in = &e->input;
    int ok = fprintf(f,
                     "{\"frame\":%" PRIu32 ",\"keys\":%" PRIu32 ",\"touch\":%u,\"tx\":%" PRId32 ",\"ty\":%" PRId32
                     ",\"room\":%" PRIu32 ",\"rng\":%" PRIu32 ",\"ops\":%" PRIu32 ",\"inst\":[",
                     frame, in->held, (unsigned)(in->touching != 0), in->touching ? in->touch_x : 0,
                     in->touching ? in->touch_y : 0, e->room, dsd_rng_state(), e->ops_last) > 0;
    bool first = true;
    for (uint32_t i = 0; i < dsd_instances.count && ok; i++) {
        const DsdInstance *inst = dsd_inst_at(dsd_instances.order[i]);
        if (inst->state != DSD_INST_LIVE) continue;
        ok = write_inst(f, inst, first) > 0;
        first = false;
    }
    return ok && fputs("]}\n", f) >= 0;
}
