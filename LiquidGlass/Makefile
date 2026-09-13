# Liquid Glass — After Effects effect plugin (macOS, universal).
#
#   make            build build/LiquidGlass.plugin
#   make install    copy it into the user MediaCore plug-ins folder
#   make clean
#
# Point AE_SDK at your After Effects SDK if it is not where it is below.

NAME     := LiquidGlass
BUNDLE   := build/$(NAME).plugin
AE_SDK   ?= /Users/parthgupta/Desktop/Projects/Code Adv/ShaderforAE/AfterEffectsSDK_25.6_61_mac/AfterEffectsSDK_25.6_61_mac/ae25.6_61.64bit.AfterEffectsSDK
EXAMPLES := $(AE_SDK)/Examples

INSTALL_DIR ?= $(HOME)/Library/Application Support/Adobe/Common/Plug-ins/7.0/MediaCore

SRCS := src/LiquidGlass.cpp \
        src/LG_Params.cpp \
        src/LG_World.cpp \
        src/LG_Image.cpp \
        src/LG_Filters.cpp \
        src/LG_Glass.cpp

# Compiled straight from the SDK rather than vendored, so an SDK update is a
# path change and not a merge.
SDK_SRCS := "$(EXAMPLES)/Util/AEGP_SuiteHandler.cpp" \
            "$(EXAMPLES)/Util/MissingSuiteError.cpp" \
            "$(EXAMPLES)/Util/Smart_Utils.cpp"

INCLUDES := -I"$(EXAMPLES)/Headers" \
            -I"$(EXAMPLES)/Headers/SP" \
            -I"$(EXAMPLES)/Util" \
            -I"$(EXAMPLES)/Resources" \
            -Isrc

# -ffast-math is deliberately absent: the sliding-window minimum in the erode
# relies on exact float comparisons, and NaN handling matters at the alpha edge.
CXXFLAGS := -std=c++17 -O3 -fvisibility=hidden -fPIC \
            -Wall -Wno-unused-parameter -Wno-multichar -Wno-deprecated-declarations \
            -mmacosx-version-min=11.0 \
            -arch x86_64 -arch arm64 \
            $(INCLUDES)

LDFLAGS := -dynamiclib -mmacosx-version-min=11.0 -arch x86_64 -arch arm64 \
           -framework CoreFoundation -framework CoreServices

REZFLAGS := -useDF -script Roman -d __MACH__ \
            -i "$(EXAMPLES)/Headers" \
            -i "$(EXAMPLES)/Util" \
            -i "$(EXAMPLES)/Resources"

.PHONY: all clean install uninstall preview

all: $(BUNDLE)

$(BUNDLE): $(SRCS) $(wildcard src/*.h) resource/$(NAME)PiPL.r resource/Info.plist
	@rm -rf "$(BUNDLE)"
	@mkdir -p "$(BUNDLE)/Contents/MacOS" "$(BUNDLE)/Contents/Resources"
	clang++ $(CXXFLAGS) $(LDFLAGS) $(SRCS) $(SDK_SRCS) -o "$(BUNDLE)/Contents/MacOS/$(NAME)"
	Rez $(REZFLAGS) -o "$(BUNDLE)/Contents/Resources/$(NAME).rsrc" resource/$(NAME)PiPL.r
	cp resource/Info.plist "$(BUNDLE)/Contents/Info.plist"
	printf 'eFKTFXTC' > "$(BUNDLE)/Contents/PkgInfo"
	@# Ad-hoc signature: unsigned bundles are refused on recent macOS.
	codesign --force --deep --sign - "$(BUNDLE)"
	@echo "built $(BUNDLE)"

install: $(BUNDLE)
	@mkdir -p "$(INSTALL_DIR)"
	rm -rf "$(INSTALL_DIR)/$(NAME).plugin"
	cp -R "$(BUNDLE)" "$(INSTALL_DIR)/"
	@echo "installed to $(INSTALL_DIR)/$(NAME).plugin — restart After Effects"

uninstall:
	rm -rf "$(INSTALL_DIR)/$(NAME).plugin"

# Host-free render check. The shading pipeline has no PF_ dependency, so it can
# be exercised straight from a main() — much faster than restarting the host.
preview: build/preview.png
	@echo "wrote build/preview.png"

build/preview.png: tests/render_preview.cpp $(wildcard src/*.h) src/LG_Image.cpp src/LG_Filters.cpp src/LG_Glass.cpp
	@mkdir -p build
	clang++ -std=c++17 -O2 -Wall -Isrc tests/render_preview.cpp \
	    src/LG_Image.cpp src/LG_Filters.cpp src/LG_Glass.cpp -o build/render_preview
	./build/render_preview build/preview.ppm
	sips -s format png build/preview.ppm --out build/preview.png >/dev/null

clean:
	rm -rf build
