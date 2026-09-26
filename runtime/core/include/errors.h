// errors.h: the runtime's R5xx error codes (contract C9 range R5xx; the catalog with titles, messages and hints is
// runtime/core/diagnostics/catalog.json, which the messages built in the core follow).
//
// Sub-ranges: R50x variables, R51x runaway scripts, R52x number range, R53x division and roots, R54x wrong kinds of
// value, R55x lists and text, R56x memory, R58x the game file, R59x script checks.
#ifndef DSD_ERRORS_H
#define DSD_ERRORS_H

#define DSD_R_NONE 0             // no error
#define DSD_R_UNSET_VAR 500      // an instance variable read before it was given a value
#define DSD_R_UNSET_GLOBAL 501   // a global read before it was given a value
#define DSD_R_WATCHDOG 510       // a script ran more than the per-frame budget (200,000 steps)
#define DSD_R_CALL_DEPTH 511     // calls nested deeper than the register stack holds
#define DSD_R_INT_OVERFLOW 520   // int32 overflow in + - * (debug builds)
#define DSD_R_FIXED_RANGE 521    // a result with a fraction outside Q20.12 (debug builds)
#define DSD_R_DIV_ZERO 530       // / div mod by zero
#define DSD_R_SQRT_NEG 531       // sqrt of a negative number
#define DSD_R_BAD_OPERANDS 540   // an operator got values it cannot combine (string + number, ...)
#define DSD_R_BAD_COMPARE 541    // an ordering comparison of values that have no order
#define DSD_R_BAD_ARGUMENT 542   // a builtin got the wrong kind of value
#define DSD_R_INDEX_RANGE 550    // a list index outside the list
#define DSD_R_TEXT_MEMORY 560    // the text/list arena is full
#define DSD_R_BAD_FILE 580       // game.dsdb is damaged
#define DSD_R_ABI_MISMATCH 581   // game.dsdb was built for a different runtime (ABI hash)
#define DSD_R_UNSUPPORTED 582    // game.dsdb uses a feature this runtime build does not have yet
#define DSD_R_FILE_TOO_BIG 583   // game.dsdb exceeds C13 dsdbMaxBytes or a runtime table
#define DSD_R_NO_FILE 584        // game.dsdb (or the file system) is missing
#define DSD_R_ASSERT 590         // assert() failed

#endif // DSD_ERRORS_H
