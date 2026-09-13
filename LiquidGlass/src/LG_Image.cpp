#include "LG_Image.h"

#include <thread>

namespace lg {

int WorkerCount() {
    unsigned int n = std::thread::hardware_concurrency();
    if (n == 0) {
        n = 4;
    }
    // Leave a core for the host: After Effects is already rendering other
    // frames on its own threads when multi-frame rendering is on.
    return static_cast<int>(n > 2 ? n - 1 : 1);
}

void ParallelRows(int height, const std::function<void(int, int)> &band) {
    if (height <= 0) {
        return;
    }

    const int workers = std::min(WorkerCount(), height);
    if (workers <= 1) {
        band(0, height);
        return;
    }

    const int rowsPer = (height + workers - 1) / workers;
    std::vector<std::thread> pool;
    pool.reserve(workers - 1);

    for (int i = 1; i < workers; ++i) {
        const int begin = i * rowsPer;
        const int end   = std::min(height, begin + rowsPer);
        if (begin >= end) {
            break;
        }
        pool.emplace_back([&band, begin, end]() { band(begin, end); });
    }

    // The calling thread takes the first band rather than idling.
    band(0, std::min(height, rowsPer));

    for (size_t i = 0; i < pool.size(); ++i) {
        pool[i].join();
    }
}

}  // namespace lg
