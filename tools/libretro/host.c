// wiz6 libretro control harness — a persistent host around the dosbox-pure core.
//
// Owns the frame loop: load Wiz6, then serve a line protocol on stdin/stdout:
//   step <n>                 advance n frames
//   key <name> <down|up|tap> set/clear/tap a key (arrows, enter, esc, space, a-z)
//   read <hexaddr> <len>     read guest-physical memory -> "ok <hex>"
//   anchor                   find the DGROUP anchor -> "ok base=<hex>"
//   fb <path>                write the latest frame as raw RGBA -> "ok <w> <h>"
//   serialize <path>         save state
//   unserialize <path>       load state
//   quit
//
// Memory is exposed by dosbox-pure via SET_MEMORY_MAPS (NOT RETRO_MEMORY_SYSTEM_RAM),
// so we capture the descriptors and read through desc[i].ptr. Verified by the spike:
// desc[0] = contiguous conventional RAM; the DGROUP anchor lives there.
#include <dlfcn.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <strings.h>
#include <stdbool.h>
#include <stdint.h>

struct retro_game_info { const char *path; const void *data; size_t size; const char *meta; };
struct retro_variable { const char *key; const char *value; };
struct retro_memory_descriptor { uint64_t flags; void *ptr; size_t offset, start, select, disconnect, len; const char *addrspace; };
struct retro_memory_map { const struct retro_memory_descriptor *descriptors; unsigned num_descriptors; };

#define DEV_KEYBOARD 3
#define DGROUP_ANCHOR_OFFSET 0x5d6  // DISK.HDR string sits at DGROUP+0x5d6 (see dgroup.ts)

static const char *SCRATCH = "/tmp/wiz6-libretro";
static struct retro_memory_descriptor g_desc[64];
static unsigned g_ndesc = 0;

// framebuffer (latest frame)
static uint8_t *g_fb = NULL; static unsigned g_fw = 0, g_fh = 0; static size_t g_fpitch = 0;
static int g_pixfmt = 1; // 0=0RGB1555 1=XRGB8888 2=RGB565

// keyboard state: RETROK id -> pressed (poll model)
static uint8_t g_keys[512];
// keyboard-event push model (dosbox-pure registers this via SET_KEYBOARD_CALLBACK)
typedef void (*retro_keyboard_event_t)(bool down, unsigned keycode, uint32_t character, uint16_t mods);
struct retro_keyboard_callback { retro_keyboard_event_t callback; };
static retro_keyboard_event_t g_kbd_cb = NULL;

static bool env(unsigned cmd, void *data) {
  unsigned c = cmd & 0xffff;
  switch (c) {
    case 3:  if (data) *(bool*)data = true; return true;          // GET_CAN_DUPE
    case 8:  return true;                                          // SET_PERFORMANCE_LEVEL
    case 9: case 31: *(const char**)data = SCRATCH; return true;   // GET_SYSTEM/SAVE_DIRECTORY
    case 10: if (data) g_pixfmt = *(int*)data; return true;        // SET_PIXEL_FORMAT
    case 15: { struct retro_variable *v = data;                    // GET_VARIABLE
               if (strstr(v->key, "cpu_core")) { v->value = "normal"; return true; }
               if (strstr(v->key, "cpu_type")) { v->value = "386"; return true; }
               v->value = NULL; return false; }
    case 17: if (data) *(bool*)data = false; return true;          // GET_VARIABLE_UPDATE
    case 36: { const struct retro_memory_map *mm = data;           // SET_MEMORY_MAPS
               g_ndesc = mm->num_descriptors > 64 ? 64 : mm->num_descriptors;
               for (unsigned i = 0; i < g_ndesc; i++) g_desc[i] = mm->descriptors[i];
               return true; }
    case 52: if (data) *(unsigned*)data = 0; return true;          // CORE_OPTIONS_VERSION
    case 12: if (data) g_kbd_cb = ((struct retro_keyboard_callback*)data)->callback; return true; // SET_KEYBOARD_CALLBACK
    case 11: case 13: case 16: case 18: case 21: case 32: case 33:
    case 34: case 35: case 37: case 42: case 53: case 54: case 64:
    case 65: case 67: case 68: case 69: case 70: return true;      // benign SET_*/register
    default: return false;
  }
}

static void cb_video(const void *data, unsigned w, unsigned h, size_t pitch) {
  if (!data) return; // dupe frame
  size_t need = pitch * h;
  if (need > g_fpitch * g_fh || !g_fb) g_fb = realloc(g_fb, need);
  memcpy(g_fb, data, need);
  g_fw = w; g_fh = h; g_fpitch = pitch;
}
static void cb_audio(int16_t l, int16_t r) { (void)l; (void)r; }
static size_t cb_audio_batch(const int16_t *d, size_t f) { (void)d; return f; }
static void cb_input_poll(void) {}
static int16_t cb_input_state(unsigned port, unsigned dev, unsigned idx, unsigned id) {
  (void)port; (void)idx;
  if (dev == DEV_KEYBOARD && id < 512) return g_keys[id] ? 1 : 0;
  return 0;
}

// name -> RETROK id
static int keyid(const char *n) {
  if (!strcasecmp(n, "up")) return 273;
  if (!strcasecmp(n, "down")) return 274;
  if (!strcasecmp(n, "right")) return 275;
  if (!strcasecmp(n, "left")) return 276;
  if (!strcasecmp(n, "enter") || !strcasecmp(n, "return")) return 13;
  if (!strcasecmp(n, "esc") || !strcasecmp(n, "escape")) return 27;
  if (!strcasecmp(n, "space")) return 32;
  if (!strcasecmp(n, "backspace")) return 8;
  if (strlen(n) == 1) { char ch = n[0]; if (ch >= 'A' && ch <= 'Z') ch += 32; return (unsigned char)ch; }
  return -1;
}

// guest-physical read into out; returns bytes read (0 if addr not mapped)
static size_t mem_read(size_t addr, size_t len, uint8_t *out) {
  for (unsigned i = 0; i < g_ndesc; i++) {
    struct retro_memory_descriptor *d = &g_desc[i];
    if (!d->ptr || !d->len) continue;
    if (addr >= d->start && addr < d->start + d->len) {
      size_t avail = d->start + d->len - addr;
      size_t n = len < avail ? len : avail;
      memcpy(out, (uint8_t*)d->ptr + (addr - d->start), n);
      return n;
    }
  }
  return 0;
}

static long find_anchor_base(void) {
  static const uint8_t a[] = {0x44,0x49,0x53,0x4b,0x2e,0x48,0x44,0x52,0x00,
    0x4d,0x53,0x47,0x2e,0x44,0x42,0x53,0x00,
    0x53,0x43,0x45,0x4e,0x41,0x52,0x49,0x4f,0x2e,0x44,0x42,0x53,0x00};
  for (unsigned i = 0; i < g_ndesc; i++) {
    struct retro_memory_descriptor *d = &g_desc[i];
    if (!d->ptr || !d->len) continue;
    void *hit = memmem(d->ptr, d->len, a, sizeof a);
    if (hit) return (long)(d->start + ((uint8_t*)hit - (uint8_t*)d->ptr) - DGROUP_ANCHOR_OFFSET);
  }
  return -1;
}

static void fb_to_rgba(uint8_t *out) {
  for (unsigned y = 0; y < g_fh; y++) {
    for (unsigned x = 0; x < g_fw; x++) {
      uint8_t *o = out + (y * g_fw + x) * 4;
      if (g_pixfmt == 1) { // XRGB8888
        uint32_t p = *(uint32_t*)(g_fb + y * g_fpitch + x * 4);
        o[0] = (p>>16)&0xff; o[1] = (p>>8)&0xff; o[2] = p&0xff; o[3] = 255;
      } else { // RGB565 (2) / 0RGB1555 fallback
        uint16_t p = *(uint16_t*)(g_fb + y * g_fpitch + x * 2);
        if (g_pixfmt == 2) { o[0]=((p>>11)&0x1f)<<3; o[1]=((p>>5)&0x3f)<<2; o[2]=(p&0x1f)<<3; }
        else { o[0]=((p>>10)&0x1f)<<3; o[1]=((p>>5)&0x1f)<<3; o[2]=(p&0x1f)<<3; }
        o[3] = 255;
      }
    }
  }
}

int main(int argc, char **argv) {
  // Callers (HostClient) always pass an explicit exe path (an ephemeral copy of
  // the committed test-fixtures/original/ image). This bare-run fallback points
  // at the committed source — NEVER the mutable ./original workspace.
  const char *exe = argc > 1 ? argv[1]
    : "/Users/nathan/Projects/ndouglas/wiz6/test-fixtures/original/wroot.exe";
  void *h = dlopen("./dosbox_pure_libretro.dylib", RTLD_NOW);
  if (!h) { fprintf(stderr, "dlopen: %s\n", dlerror()); return 1; }
  void (*set_env)(void*) = dlsym(h, "retro_set_environment");
  void (*set_vr)(void*) = dlsym(h, "retro_set_video_refresh");
  void (*set_as)(void*) = dlsym(h, "retro_set_audio_sample");
  void (*set_asb)(void*) = dlsym(h, "retro_set_audio_sample_batch");
  void (*set_ip)(void*) = dlsym(h, "retro_set_input_poll");
  void (*set_is)(void*) = dlsym(h, "retro_set_input_state");
  void (*r_init)(void) = dlsym(h, "retro_init");
  bool (*load)(const struct retro_game_info*) = dlsym(h, "retro_load_game");
  void (*run)(void) = dlsym(h, "retro_run");
  size_t (*ser_size)(void) = dlsym(h, "retro_serialize_size");
  bool (*ser)(void*, size_t) = dlsym(h, "retro_serialize");
  bool (*unser)(const void*, size_t) = dlsym(h, "retro_unserialize");

  set_env(env); set_vr(cb_video); set_as(cb_audio); set_asb(cb_audio_batch);
  set_ip(cb_input_poll); set_is(cb_input_state);
  r_init();
  struct retro_game_info gi = { exe, NULL, 0, NULL };
  if (!load(&gi)) { fprintf(stderr, "retro_load_game FAILED\n"); return 2; }
  setvbuf(stdout, NULL, _IOLBF, 0);
  fprintf(stderr, "ready (pixfmt=%d)\n", g_pixfmt);

  char line[256];
  while (fgets(line, sizeof line, stdin)) {
    char cmd[32] = {0}, a1[160] = {0}, a2[32] = {0};
    int nf = sscanf(line, "%31s %159s %31s", cmd, a1, a2);
    if (nf < 1) continue;
    if (!strcmp(cmd, "quit")) break;
    else if (!strcmp(cmd, "step")) { int n = nf>1?atoi(a1):1; for (int i=0;i<n;i++) run(); printf("ok\n"); }
    else if (!strcmp(cmd, "key")) {
      int id = keyid(a1);
      if (id < 0) { printf("err badkey\n"); continue; }
      uint32_t ch = (id < 128) ? (uint32_t)id : 0;
      if (!strcmp(a2, "down")) { g_keys[id]=1; if(g_kbd_cb)g_kbd_cb(true,id,ch,0); printf("ok\n"); }
      else if (!strcmp(a2, "up")) { g_keys[id]=0; if(g_kbd_cb)g_kbd_cb(false,id,ch,0); printf("ok\n"); }
      else { // tap: press, run, release, run
        g_keys[id]=1; if(g_kbd_cb)g_kbd_cb(true,id,ch,0); run(); run();
        g_keys[id]=0; if(g_kbd_cb)g_kbd_cb(false,id,ch,0); run(); printf("ok\n"); }
    }
    else if (!strcmp(cmd, "read")) {
      size_t addr = strtoul(a1, NULL, 16), len = strtoul(a2, NULL, 0);
      if (len == 0 || len > 65536) { printf("err len\n"); continue; }
      uint8_t *buf = malloc(len);
      size_t got = mem_read(addr, len, buf);
      if (!got) { printf("err unmapped\n"); free(buf); continue; }
      fputs("ok ", stdout);
      for (size_t i=0;i<got;i++) printf("%02x", buf[i]);
      printf("\n"); free(buf);
    }
    else if (!strcmp(cmd, "anchor")) {
      long base = find_anchor_base();
      if (base < 0) printf("err noanchor\n"); else printf("ok base=%lx\n", base);
    }
    else if (!strcmp(cmd, "find")) {
      // pattern = rest of line after "find ", hex pairs (spaces optional)
      const char *p = strchr(line, ' ');
      uint8_t pat[256]; size_t pn = 0; int hi = -1;
      for (; p && *p && pn < sizeof pat; p++) {
        int v; char ch = *p;
        if (ch >= '0' && ch <= '9') v = ch - '0';
        else if (ch >= 'a' && ch <= 'f') v = ch - 'a' + 10;
        else if (ch >= 'A' && ch <= 'F') v = ch - 'A' + 10;
        else continue;
        if (hi < 0) hi = v; else { pat[pn++] = (hi << 4) | v; hi = -1; }
      }
      if (pn == 0) { printf("err pattern\n"); continue; }
      long found = -1;
      for (unsigned i = 0; i < g_ndesc && found < 0; i++) {
        struct retro_memory_descriptor *d = &g_desc[i];
        if (!d->ptr || !d->len) continue;
        void *hit = memmem(d->ptr, d->len, pat, pn);
        if (hit) found = (long)(d->start + ((uint8_t*)hit - (uint8_t*)d->ptr));
      }
      if (found < 0) printf("err nomatch\n"); else printf("ok phys=%lx\n", found);
    }
    else if (!strcmp(cmd, "fb")) {
      if (!g_fb || !g_fw) { printf("err noframe\n"); continue; }
      uint8_t *rgba = malloc((size_t)g_fw*g_fh*4); fb_to_rgba(rgba);
      FILE *f = fopen(a1, "wb"); if (!f) { printf("err open\n"); free(rgba); continue; }
      fwrite(rgba, 1, (size_t)g_fw*g_fh*4, f); fclose(f); free(rgba);
      printf("ok %u %u\n", g_fw, g_fh);
    }
    else if (!strcmp(cmd, "serialize")) {
      size_t sz = ser_size(); void *b = malloc(sz);
      if (ser(b, sz)) { FILE*f=fopen(a1,"wb"); fwrite(b,1,sz,f); fclose(f); printf("ok %zu\n", sz); }
      else printf("err ser\n");
      free(b);
    }
    else if (!strcmp(cmd, "unserialize")) {
      FILE *f = fopen(a1, "rb"); if (!f) { printf("err open\n"); continue; }
      fseek(f,0,SEEK_END); long sz=ftell(f); fseek(f,0,SEEK_SET);
      void *b = malloc(sz); fread(b,1,sz,f); fclose(f);
      printf(unser(b, sz) ? "ok\n" : "err unser\n"); free(b);
    }
    else printf("err cmd\n");
  }
  return 0;
}
